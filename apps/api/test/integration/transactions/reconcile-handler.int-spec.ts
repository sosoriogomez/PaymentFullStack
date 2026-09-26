import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { PRODUCT_SEEDS, seedProducts } from '../../../src/database/seeds/products.seed';
import { type SecretSources } from '../../../src/bootstrap/secrets-loader';
import { TypeOrmCustomerRepository } from '../../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { TypeOrmTransactionRepository } from '../../../src/modules/transactions/infrastructure/persistence/typeorm-transaction.repository';
import { closeReconciliationContext, runReconciliation } from '../../../src/reconcile';
import { aCustomer, CUSTOMER_ID } from '../../builders/customer.builder';
import { aTransaction } from '../../builders/transaction.builder';
import { databaseSettings } from '../../support/database/settings';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';
import { testEnv } from '../../support/test-env';

const noSecrets: SecretSources = {
  getParameters: () => Promise.resolve({}),
  getSecretString: () => Promise.reject(new Error('not used')),
};

/** Stands in for the gateway: it has no record of any reference. */
const startEmptyGateway = () =>
  new Promise<Server>((resolve) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [] }));
    });
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });

describe('reconcile Lambda handler', () => {
  const product = PRODUCT_SEEDS.find((seed) => seed.stock > 0)!;
  let database: TestDatabase;
  let dataSource: DataSource;
  let gateway: Server;
  let transactions: TypeOrmTransactionRepository;
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  const pending = (n: number, createdAt: Date) =>
    aTransaction()
      .with({
        id: `77777777-7777-4777-8777-00000000000${n}`,
        reference: `TX-RECONCILE-${n}`,
        idempotencyKey: `88888888-8888-4888-8888-00000000000${n}`,
        productId: product.id,
        customerId: CUSTOMER_ID,
        createdAt,
      })
      .build();

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
    await new TypeOrmCustomerRepository(dataSource).upsertByEmail(aCustomer());
    transactions = new TypeOrmTransactionRepository(dataSource);
    gateway = await startEmptyGateway();
    const { port } = gateway.address() as AddressInfo;
    Object.assign(
      process.env,
      testEnv({ DATABASE_URL: database.url, PG_BASE_URL: `http://127.0.0.1:${port}/v1` }),
    );
  });

  afterAll(async () => {
    await closeReconciliationContext();
    await dataSource.destroy();
    await database.drop();
    await new Promise((resolve) => gateway.close(resolve));
  });

  it('should find old PENDING transactions, oldest first and within the batch size', async () => {
    await transactions.insertPending(pending(1, minutesAgo(20)));
    await transactions.insertPending(pending(2, minutesAgo(40)));
    await transactions.insertPending(pending(3, minutesAgo(0.1)));

    const found = await transactions.findPendingOlderThan(minutesAgo(1), 10);
    const firstOnly = await transactions.findPendingOlderThan(minutesAgo(1), 1);

    expect(found.map((transaction) => transaction.reference)).toEqual([
      'TX-RECONCILE-2',
      'TX-RECONCILE-1',
    ]);
    expect(firstOnly).toHaveLength(1);
  });

  it('should expire the old PENDING the gateway never saw and keep the recent one', async () => {
    const summary = await runReconciliation(noSecrets);

    expect(summary).toEqual({ scanned: 2, finalized: 0, expired: 2, failed: 0 });
    expect((await transactions.findByReference('TX-RECONCILE-1'))?.statusMessage).toBe(
      'EXPIRED_WITHOUT_GATEWAY_RECORD',
    );
    expect((await transactions.findByReference('TX-RECONCILE-3'))?.status).toBe('PENDING');
  });

  it('should reuse the context on the next run and find nothing left', async () => {
    expect(await runReconciliation(noSecrets)).toEqual({
      scanned: 0,
      finalized: 0,
      expired: 0,
      failed: 0,
    });
  });
});
