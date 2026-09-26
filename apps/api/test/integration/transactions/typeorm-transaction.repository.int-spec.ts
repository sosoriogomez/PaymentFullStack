import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { PRODUCT_SEEDS, seedProducts } from '../../../src/database/seeds/products.seed';
import { FlatFeePolicy } from '../../../src/modules/checkout/domain/flat-fee.policy';
import { TypeOrmDeliveryRepository } from '../../../src/modules/deliveries/infrastructure/persistence/typeorm-delivery.repository';
import { TypeOrmCustomerRepository } from '../../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { TypeOrmProductRepository } from '../../../src/modules/products/infrastructure/persistence/typeorm-product.repository';
import {
  CreateTransaction,
  type CreateTransactionCommand,
} from '../../../src/modules/transactions/application/create-transaction.use-case';
import { TransactionViews } from '../../../src/modules/transactions/application/transaction-views';
import { type Transaction } from '../../../src/modules/transactions/domain/transaction';
import { TypeOrmTransactionRepository } from '../../../src/modules/transactions/infrastructure/persistence/typeorm-transaction.repository';
import { UlidReferenceGenerator } from '../../../src/modules/transactions/infrastructure/references/ulid-reference-generator';
import { CryptoIdGenerator } from '../../../src/shared/infrastructure/kernel/kernel-adapters';
import { TypeOrmUnitOfWork } from '../../../src/shared/infrastructure/database/typeorm-unit-of-work';
import { err, type Result } from '../../../src/shared/kernel/result';
import { aCustomer, CUSTOMER_ID } from '../../builders/customer.builder';
import { aTransaction, DELIVERY, PAYMENT } from '../../builders/transaction.builder';
import { FakePaymentGateway } from '../../fakes/fake-payment-gateway';
import { FixedClock, hasher } from '../../fakes/kernel';
import { databaseSettings } from '../../support/database/settings';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';

const valid = <T>(result: Result<T, unknown>): T => {
  if (!result.ok) throw new Error(`invalid test value: ${JSON.stringify(result.error)}`);
  return result.value;
};

const uuid = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;

describe('TypeOrmTransactionRepository', () => {
  const product = PRODUCT_SEEDS.find((seed) => seed.stock >= 5)!;
  let database: TestDatabase;
  let dataSource: DataSource;
  let repository: TypeOrmTransactionRepository;
  let counter = 0;

  /** A fresh PENDING transaction with its own id, reference and idempotency key. */
  const aPending = (): Transaction => {
    counter += 1;
    return aTransaction()
      .with({
        id: uuid(counter),
        reference: `TX-INT${String(counter).padStart(4, '0')}`,
        idempotencyKey: uuid(1000 + counter),
        productId: product.id,
        customerId: CUSTOMER_ID,
      })
      .build();
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
    await new TypeOrmCustomerRepository(dataSource).upsertByEmail(aCustomer());
    repository = new TypeOrmTransactionRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('should persist a PENDING transaction and read it back unchanged', async () => {
    const pending = aPending();

    expect(await repository.insertPending(pending)).toBe('inserted');
    const stored = await repository.findById(pending.id);

    expect(stored?.status).toBe('PENDING');
    expect(stored?.amounts.total.amountInCents).toBe(163_000_00);
    expect(typeof stored?.amounts.product.amountInCents).toBe('number');
    expect(stored?.amounts.total.currency).toBe('COP');
    expect(stored?.shipping).toEqual(DELIVERY);
    expect(stored?.createdAt).toEqual(pending.createdAt);
    expect(stored?.card).toBeNull();
    expect(await repository.findByIdempotencyKey(pending.idempotencyKey)).toMatchObject({
      id: pending.id,
    });
  });

  it('should report a duplicate idempotency key instead of inserting a second row', async () => {
    const first = aPending();
    await repository.insertPending(first);
    const sameKey = aTransaction()
      .with({
        id: uuid(900),
        reference: 'TX-INT-DUP',
        idempotencyKey: first.idempotencyKey,
        productId: product.id,
        customerId: CUSTOMER_ID,
      })
      .build();

    expect(await repository.insertPending(sameKey)).toBe('duplicate-idempotency-key');
    expect(await repository.findById(sameKey.id)).toBeNull();
  });

  it('should not hide other constraint violations', async () => {
    const first = aPending();
    await repository.insertPending(first);
    const sameReference = aTransaction()
      .with({
        id: uuid(901),
        reference: first.reference,
        idempotencyKey: uuid(1901),
        productId: product.id,
        customerId: CUSTOMER_ID,
      })
      .build();

    await expect(repository.insertPending(sameReference)).rejects.toThrow(/reference/);
  });

  it('should update only while the row is PENDING (optimistic guard)', async () => {
    const pending = aPending();
    await repository.insertPending(pending);
    const charged = valid(
      pending.recordCharge({
        gatewayTransactionId: `gw-${pending.id}`,
        card: { brand: 'VISA', lastFour: '4242' },
      }),
    );
    const approved = valid(
      charged.finalize({ status: 'APPROVED', statusMessage: null }, new Date()),
    );
    const declined = valid(
      charged.finalize({ status: 'DECLINED', statusMessage: 'late' }, new Date()),
    );

    expect(await repository.updateIfPending(charged)).toBe(true);
    expect(await repository.updateIfPending(approved)).toBe(true);
    expect(await repository.updateIfPending(declined)).toBe(false);

    const stored = await repository.findById(pending.id);
    expect(stored?.status).toBe('APPROVED');
    expect(stored?.gatewayTransactionId).toBe(`gw-${pending.id}`);
    expect(stored?.card).toEqual({ brand: 'VISA', lastFour: '4242' });
    expect(stored?.finalizedAt).toBeInstanceOf(Date);
  });

  it('should take part in a unit of work and roll back with it', async () => {
    const pending = aPending();
    await repository.insertPending(pending);
    const approved = valid(
      pending.finalize({ status: 'APPROVED', statusMessage: null }, new Date()),
    );

    await new TypeOrmUnitOfWork(dataSource).run(async (tx) => {
      await repository.updateIfPending(approved, tx);
      expect((await repository.findById(pending.id, tx))?.status).toBe('APPROVED');
      return err('rollback');
    });

    expect((await repository.findById(pending.id))?.status).toBe('PENDING');
  });

  describe('CreateTransaction against Postgres', () => {
    const createTransaction = (gateway: FakePaymentGateway) => {
      const products = new TypeOrmProductRepository(dataSource);
      return new CreateTransaction({
        transactions: repository,
        products,
        customers: new TypeOrmCustomerRepository(dataSource),
        gateway,
        fees: new FlatFeePolicy({
          baseFeeInCents: 3_000_00,
          deliveryFeeInCents: 10_000_00,
          currency: 'COP',
        }),
        references: new UlidReferenceGenerator(),
        ids: new CryptoIdGenerator(),
        clock: new FixedClock(),
        hasher,
        views: new TransactionViews(products, new TypeOrmDeliveryRepository(dataSource)),
      });
    };
    const command = (idempotencyKey: string): CreateTransactionCommand => ({
      idempotencyKey,
      productId: product.id,
      quantity: 1,
      customerId: CUSTOMER_ID,
      delivery: DELIVERY,
      payment: PAYMENT,
    });

    it('should create one row and charge once when two requests with the same key race', async () => {
      const gateway = new FakePaymentGateway('race');
      const useCase = createTransaction(gateway);
      const key = uuid(5000);

      const results = await Promise.all([
        useCase.execute(command(key)),
        useCase.execute(command(key)),
      ]);

      expect(results.map((result) => result.ok && result.value.kind).sort()).toEqual([
        'created',
        'replayed',
      ]);
      const rows = await dataSource.query<{ count: string }[]>(
        'SELECT count(*) FROM transactions WHERE idempotency_key = $1',
        [key],
      );
      expect(rows[0]?.count).toBe('1');
      expect(gateway.charges).toHaveLength(1);
    });

    it('should never persist the card token or the acceptance tokens', async () => {
      const key = uuid(5001);
      await createTransaction(new FakePaymentGateway('tokens')).execute(command(key));

      const [row] = await dataSource.query<Record<string, unknown>[]>(
        'SELECT * FROM transactions WHERE idempotency_key = $1',
        [key],
      );

      const stored = JSON.stringify(row);
      expect(stored).not.toContain(PAYMENT.cardToken);
      expect(stored).not.toContain(PAYMENT.acceptanceToken);
      expect(stored).not.toContain(PAYMENT.acceptPersonalAuth);
    });
  });
});
