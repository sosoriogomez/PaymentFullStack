import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { PRODUCT_SEEDS, seedProducts } from '../../../src/database/seeds/products.seed';
import { TypeOrmDeliveryRepository } from '../../../src/modules/deliveries/infrastructure/persistence/typeorm-delivery.repository';
import { TypeOrmCustomerRepository } from '../../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { type FinalGatewayTransaction } from '../../../src/modules/payment-gateway/domain/payment-gateway.port';
import { TypeOrmProductRepository } from '../../../src/modules/products/infrastructure/persistence/typeorm-product.repository';
import { FinalizeTransaction } from '../../../src/modules/transactions/application/finalize-transaction.use-case';
import { type Transaction } from '../../../src/modules/transactions/domain/transaction';
import { TypeOrmTransactionRepository } from '../../../src/modules/transactions/infrastructure/persistence/typeorm-transaction.repository';
import { TypeOrmUnitOfWork } from '../../../src/shared/infrastructure/database/typeorm-unit-of-work';
import { CryptoIdGenerator } from '../../../src/shared/infrastructure/kernel/kernel-adapters';
import { aCustomer, CUSTOMER_ID } from '../../builders/customer.builder';
import { aTransaction } from '../../builders/transaction.builder';
import { FixedClock } from '../../fakes/kernel';
import { databaseSettings } from '../../support/database/settings';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';

const uuid = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;

describe('FinalizeTransaction against Postgres', () => {
  const product = PRODUCT_SEEDS.find((seed) => seed.stock > 0)!;
  let database: TestDatabase;
  let dataSource: DataSource;
  let transactions: TypeOrmTransactionRepository;
  let deliveries: TypeOrmDeliveryRepository;
  let counter = 0;

  const finalizer = (deliveryRepository = deliveries) =>
    new FinalizeTransaction({
      unitOfWork: new TypeOrmUnitOfWork(dataSource),
      transactions,
      products: new TypeOrmProductRepository(dataSource),
      deliveries: deliveryRepository,
      ids: new CryptoIdGenerator(),
      clock: new FixedClock(),
      alerts: { warn: jest.fn(), error: jest.fn() },
    });

  const pending = async (quantity = 2): Promise<Transaction> => {
    counter += 1;
    const transaction = aTransaction()
      .with({
        id: uuid(counter),
        reference: `TX-FIN${String(counter).padStart(4, '0')}`,
        idempotencyKey: uuid(1000 + counter),
        productId: product.id,
        customerId: CUSTOMER_ID,
        quantity,
      })
      .build();
    await transactions.insertPending(transaction);
    return transaction;
  };

  const record = (
    transaction: Transaction,
    overrides: Partial<FinalGatewayTransaction> = {},
  ): FinalGatewayTransaction => ({
    id: `gw-${transaction.id}`,
    reference: transaction.reference,
    status: 'APPROVED',
    statusMessage: null,
    amountInCents: transaction.amounts.total.amountInCents,
    currency: 'COP',
    card: { brand: 'VISA', lastFour: '4242' },
    ...overrides,
  });

  const setStock = (stock: number) =>
    dataSource.query('UPDATE products SET stock = $1 WHERE id = $2', [stock, product.id]);
  const stock = async () =>
    (
      await dataSource.query<{ stock: number }[]>('SELECT stock FROM products WHERE id = $1', [
        product.id,
      ])
    )[0]?.stock;
  const deliveriesOf = (transactionId: string) =>
    dataSource.query<{ id: string; status: string }[]>(
      'SELECT id, status FROM deliveries WHERE transaction_id = $1',
      [transactionId],
    );

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
    await new TypeOrmCustomerRepository(dataSource).upsertByEmail(aCustomer());
    transactions = new TypeOrmTransactionRepository(dataSource);
    deliveries = new TypeOrmDeliveryRepository(dataSource);
  });

  beforeEach(() => setStock(5));

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('should decrement exactly the quantity and assign one delivery with the address', async () => {
    const transaction = await pending(2);

    await finalizer().execute({ transactionId: transaction.id, record: record(transaction) });

    expect(await stock()).toBe(3);
    const [row] = await deliveriesOf(transaction.id);
    expect(row?.status).toBe('ASSIGNED');
    const delivery = (await deliveries.findById(row!.id))!;
    expect(delivery.address).toEqual(transaction.shipping);
    expect(await deliveries.findIdByTransactionId(transaction.id)).toBe(row?.id);
    expect((await transactions.findById(transaction.id))?.status).toBe('APPROVED');
  });

  it('should keep the stock and create no delivery for a declined payment', async () => {
    const transaction = await pending();

    await finalizer().execute({
      transactionId: transaction.id,
      record: record(transaction, { status: 'DECLINED' }),
    });

    expect(await stock()).toBe(5);
    expect(await deliveriesOf(transaction.id)).toHaveLength(0);
  });

  it('should decrement once and deliver once when two paths finalize at the same time', async () => {
    const transaction = await pending(2);
    const command = { transactionId: transaction.id, record: record(transaction) };

    const results = await Promise.all([finalizer().execute(command), finalizer().execute(command)]);

    expect(results.filter((result) => result.ok && result.value.changed)).toHaveLength(1);
    expect(await stock()).toBe(3);
    expect(await deliveriesOf(transaction.id)).toHaveLength(1);
  });

  it('should never go below zero: the last unit is assigned once, the other one backordered', async () => {
    await setStock(1);
    const first = await pending(1);
    const second = await pending(1);

    await Promise.all([
      finalizer().execute({ transactionId: first.id, record: record(first) }),
      finalizer().execute({ transactionId: second.id, record: record(second) }),
    ]);

    expect(await stock()).toBe(0);
    const statuses = [...(await deliveriesOf(first.id)), ...(await deliveriesOf(second.id))]
      .map((row) => row.status)
      .sort();
    expect(statuses).toEqual(['ASSIGNED', 'BACKORDERED']);
  });

  it('should roll everything back when a step fails', async () => {
    const transaction = await pending(2);
    const failing = new TypeOrmDeliveryRepository(dataSource);
    jest.spyOn(failing, 'save').mockRejectedValueOnce(new Error('disk full'));

    await expect(
      finalizer(failing).execute({ transactionId: transaction.id, record: record(transaction) }),
    ).rejects.toThrow('disk full');

    expect(await stock()).toBe(5);
    expect((await transactions.findById(transaction.id))?.status).toBe('PENDING');
  });

  it('should end in ERROR without delivery when the gateway amount differs (I-06)', async () => {
    const transaction = await pending(2);

    await finalizer().execute({
      transactionId: transaction.id,
      record: record(transaction, { amountInCents: 1 }),
    });

    const stored = await transactions.findById(transaction.id);
    expect(stored?.status).toBe('ERROR');
    expect(stored?.statusMessage).toBe('AMOUNT_MISMATCH');
    expect(await stock()).toBe(5);
    expect(await deliveriesOf(transaction.id)).toHaveLength(0);
  });

  it('should return null for a transaction without delivery', async () => {
    expect(await deliveries.findIdByTransactionId(uuid(9999))).toBeNull();
    expect(await deliveries.findById(uuid(9999))).toBeNull();
  });
});
