import { aProduct } from '../../../../test/builders/product.builder';
import { aTransaction } from '../../../../test/builders/transaction.builder';
import { FakePaymentGateway } from '../../../../test/fakes/fake-payment-gateway';
import { InMemoryDeliveryRepository } from '../../../../test/fakes/in-memory-delivery.repository';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { InMemoryTransactionRepository } from '../../../../test/fakes/in-memory-transaction.repository';
import { InMemoryUnitOfWork } from '../../../../test/fakes/in-memory-unit-of-work';
import { FixedClock, NOW, SequentialIdGenerator } from '../../../../test/fakes/kernel';
import { type AlertLog } from '../../../shared/kernel/ports';
import { type Transaction } from '../domain/transaction';
import { FinalizeTransaction } from './finalize-transaction.use-case';
import { ReconcilePendingTransactions } from './reconcile-pending-transactions.use-case';
import { SyncTransactionStatus } from './sync-transaction-status.use-case';

const SETTINGS = { minAgeSeconds: 60, batchSize: 25, pendingExpirationMinutes: 15 };
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

let counter = 0;
/** A PENDING transaction created `minutes` ago with its own id and reference. */
const pendingSince = (minutes: number): Transaction => {
  counter += 1;
  return aTransaction()
    .with({
      id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      reference: `TX-REC${String(counter).padStart(4, '0')}`,
      idempotencyKey: `10000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      createdAt: minutesAgo(minutes),
    })
    .build();
};

const setup = (transactions: Transaction[], batchSize = SETTINGS.batchSize) => {
  const repository = new InMemoryTransactionRepository(transactions);
  const products = new InMemoryProductRepository([aProduct().withStock(5).build()]);
  const deliveries = new InMemoryDeliveryRepository();
  const gateway = new FakePaymentGateway();
  const clock = new FixedClock();
  const alerts: jest.Mocked<AlertLog> = { warn: jest.fn(), error: jest.fn() };
  const finalize = new FinalizeTransaction({
    unitOfWork: new InMemoryUnitOfWork(),
    transactions: repository,
    products,
    deliveries,
    ids: new SequentialIdGenerator(),
    clock,
    alerts,
  });
  const sync = new SyncTransactionStatus(repository, gateway, finalize);
  const useCase = new ReconcilePendingTransactions(repository, sync, clock, alerts, {
    ...SETTINGS,
    batchSize,
  });
  /** Records the charge in the gateway as the original POST did. */
  const charged = async (transaction: Transaction) => {
    await gateway.createCardTransaction({
      reference: transaction.reference,
      amountInCents: transaction.amounts.total.amountInCents,
      currency: 'COP',
      customerEmail: 'ana@mail.com',
      customer: { fullName: 'Ana Pérez', phone: '3001234567' },
      cardToken: 'tok',
      installments: 1,
      acceptanceToken: 'a',
      acceptPersonalAuth: 'b',
      shipping: transaction.shipping,
    });
  };
  return { useCase, repository, products, deliveries, gateway, alerts, sync, charged };
};

describe('ReconcilePendingTransactions', () => {
  it('should finalize a 2-minute PENDING the gateway approved, without the client', async () => {
    const transaction = pendingSince(2);
    const { useCase, repository, products, deliveries, charged } = setup([transaction]);
    await charged(transaction);

    const summary = await useCase.execute();

    expect(summary).toEqual({ scanned: 1, finalized: 1, expired: 0, failed: 0 });
    expect((await repository.findById(transaction.id))?.status).toBe('APPROVED');
    expect((await products.findById(transaction.productId))?.stock).toBe(4);
    expect(deliveries.all).toHaveLength(1);
  });

  it('should expire a 20-minute PENDING the gateway never saw', async () => {
    const transaction = pendingSince(20);
    const { useCase, repository } = setup([transaction]);

    const summary = await useCase.execute();

    expect(summary).toEqual({ scanned: 1, finalized: 0, expired: 1, failed: 0 });
    const stored = await repository.findById(transaction.id);
    expect(stored?.status).toBe('ERROR');
    expect(stored?.statusMessage).toBe('EXPIRED_WITHOUT_GATEWAY_RECORD');
  });

  it('should leave alone a 30-second PENDING (the client is still polling)', async () => {
    const transaction = pendingSince(0.5);
    const { useCase, repository } = setup([transaction]);

    expect(await useCase.execute()).toEqual({ scanned: 0, finalized: 0, expired: 0, failed: 0 });
    expect((await repository.findById(transaction.id))?.status).toBe('PENDING');
  });

  it('should keep waiting for a young PENDING the gateway has not seen yet', async () => {
    const transaction = pendingSince(5);
    const { useCase, repository } = setup([transaction]);

    expect(await useCase.execute()).toEqual({ scanned: 1, finalized: 0, expired: 0, failed: 0 });
    expect((await repository.findById(transaction.id))?.status).toBe('PENDING');
  });

  it('should count an unreachable gateway as failed and try again next time', async () => {
    const transaction = pendingSince(20);
    const { useCase, gateway, repository } = setup([transaction]);
    gateway.failOn('read', { code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' });

    expect(await useCase.execute()).toMatchObject({ scanned: 1, failed: 1, expired: 0 });
    expect((await repository.findById(transaction.id))?.status).toBe('PENDING');
  });

  it('should go on with the batch when one transaction fails unexpectedly', async () => {
    const broken = pendingSince(30);
    const approved = pendingSince(10);
    const { useCase, sync, alerts, charged } = setup([broken, approved]);
    await charged(approved);
    const execute = sync.execute.bind(sync);
    jest
      .spyOn(sync, 'execute')
      .mockImplementation((id) =>
        id === broken.id ? Promise.reject(new Error('connection reset')) : execute(id),
      );

    const summary = await useCase.execute();

    expect(summary).toEqual({ scanned: 2, finalized: 1, expired: 0, failed: 1 });
    expect(alerts.error).toHaveBeenCalledWith('RECONCILIATION_FAILED', {
      transactionId: broken.id,
      reason: 'connection reset',
    });
  });

  it('should not count an expiry that lost the race with another path', async () => {
    const transaction = pendingSince(20);
    const { useCase, repository } = setup([transaction]);
    jest.spyOn(repository, 'updateIfPending').mockResolvedValueOnce(false);

    expect(await useCase.execute()).toMatchObject({ scanned: 1, expired: 0 });
  });

  it('should process the oldest first, at most one batch per run', async () => {
    const newest = pendingSince(2);
    const oldest = pendingSince(40);
    const { useCase, repository } = setup([newest, oldest], 1);

    await useCase.execute();

    expect((await repository.findById(oldest.id))?.status).toBe('ERROR');
    expect((await repository.findById(newest.id))?.status).toBe('PENDING');
  });
});
