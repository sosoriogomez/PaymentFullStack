import { aProduct } from '../../../../test/builders/product.builder';
import { aTransaction, TRANSACTION_ID } from '../../../../test/builders/transaction.builder';
import { FakePaymentGateway } from '../../../../test/fakes/fake-payment-gateway';
import { InMemoryDeliveryRepository } from '../../../../test/fakes/in-memory-delivery.repository';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { InMemoryTransactionRepository } from '../../../../test/fakes/in-memory-transaction.repository';
import { InMemoryUnitOfWork } from '../../../../test/fakes/in-memory-unit-of-work';
import { FixedClock, NOW, SequentialIdGenerator } from '../../../../test/fakes/kernel';
import { type Transaction } from '../domain/transaction';
import { FinalizeTransaction } from './finalize-transaction.use-case';
import { GetTransaction } from './get-transaction.use-case';
import { SyncTransactionStatus } from './sync-transaction-status.use-case';
import { TransactionViews } from './transaction-views';

const REFERENCE = 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W';

/** Records a charge in the fake gateway for the transaction, as its POST would have done. */
const chargeInGateway = async (
  gateway: FakePaymentGateway,
  transaction: Transaction,
): Promise<string> => {
  const result = await gateway.createCardTransaction({
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
  if (!result.ok) throw new Error('fake gateway did not charge');
  return result.value.id;
};

const setup = (transaction: Transaction = aTransaction().build()) => {
  const transactions = new InMemoryTransactionRepository([transaction]);
  const products = new InMemoryProductRepository([aProduct().withStock(5).build()]);
  const deliveries = new InMemoryDeliveryRepository();
  const gateway = new FakePaymentGateway();
  const finalize = new FinalizeTransaction({
    unitOfWork: new InMemoryUnitOfWork(),
    transactions,
    products,
    deliveries,
    ids: new SequentialIdGenerator(),
    clock: new FixedClock(),
    alerts: { warn: jest.fn(), error: jest.fn() },
  });
  const sync = new SyncTransactionStatus(transactions, gateway, finalize);
  const views = new TransactionViews(products, deliveries);
  return { sync, gateway, transactions, deliveries, views };
};

describe('SyncTransactionStatus', () => {
  it('should not call the gateway for a final transaction', async () => {
    const { sync, gateway } = setup(
      aTransaction().with({ status: 'APPROVED', finalizedAt: NOW }).build(),
    );
    const read = jest.spyOn(gateway, 'getTransaction');

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.result).toBe('already-final');
    expect(read).not.toHaveBeenCalled();
  });

  it('should finalize by gateway id when the gateway already settled the charge', async () => {
    const pending = aTransaction().build();
    const { sync, gateway, transactions, deliveries } = setup(pending);
    const gatewayId = await chargeInGateway(gateway, pending);
    await transactions.updateIfPending(
      aTransaction().with({ gatewayTransactionId: gatewayId }).build(),
    );

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.result).toBe('finalized');
    expect(result.ok && result.value.transaction.status).toBe('APPROVED');
    expect(deliveries.all).toHaveLength(1);
  });

  it('should find the charge by reference when the POST answer was lost', async () => {
    const pending = aTransaction().build();
    const { sync, gateway, transactions } = setup(pending);
    const gatewayId = await chargeInGateway(
      gateway.willCharge({ initial: 'PENDING', settlesTo: 'DECLINED' }),
      pending,
    );

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.transaction.status).toBe('DECLINED');
    expect((await transactions.findById(TRANSACTION_ID))?.gatewayTransactionId).toBe(gatewayId);
  });

  it('should keep it PENDING and remember the gateway id while the gateway is still processing', async () => {
    const pending = aTransaction().build();
    const { sync, gateway, transactions } = setup(pending);
    const gatewayId = await chargeInGateway(gateway.willCharge({ initial: 'PENDING' }), pending);

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.result).toBe('gateway-pending');
    expect(result.ok && result.value.transaction.gatewayTransactionId).toBe(gatewayId);
    expect((await transactions.findById(TRANSACTION_ID))?.status).toBe('PENDING');
  });

  it('should not adopt a pending gateway record that is not exactly ours', async () => {
    const pending = aTransaction().build();
    const { sync, gateway } = setup(pending);
    gateway.willCharge({ initial: 'PENDING', reportedAmountInCents: 1 });
    await chargeInGateway(gateway, pending);

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.transaction.gatewayTransactionId).toBeNull();
  });

  it('should keep its state when the gateway id cannot be saved (finalized in between)', async () => {
    const pending = aTransaction().build();
    const { sync, gateway, transactions } = setup(pending);
    await chargeInGateway(gateway.willCharge({ initial: 'PENDING' }), pending);
    jest.spyOn(transactions, 'updateIfPending').mockResolvedValueOnce(false);

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.transaction.gatewayTransactionId).toBeNull();
  });

  it('should report a charge the gateway never received', async () => {
    const { sync } = setup();

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.result).toBe('gateway-missing');
    expect(result.ok && result.value.transaction.status).toBe('PENDING');
  });

  it('should keep it PENDING when the gateway is unavailable', async () => {
    const { sync, gateway } = setup(aTransaction().with({ gatewayTransactionId: 'gw-1' }).build());
    gateway.failOn('read', { code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' });

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.result).toBe('gateway-unavailable');
  });

  it('should report already-final when another path finalized it during the sync', async () => {
    const pending = aTransaction().build();
    const { sync, gateway, transactions } = setup(pending);
    await chargeInGateway(gateway, pending);
    jest.spyOn(transactions, 'updateIfPending').mockResolvedValueOnce(false);

    const result = await sync.execute(TRANSACTION_ID);

    expect(result.ok && result.value.result).toBe('already-final');
  });

  it('should answer TRANSACTION_NOT_FOUND for an unknown id', async () => {
    const { sync } = setup();

    const result = await sync.execute('00000000-0000-4000-8000-000000000000');

    expect(!result.ok && result.error.code).toBe('TRANSACTION_NOT_FOUND');
  });
});

describe('GetTransaction', () => {
  it('should return the synced transaction with its delivery', async () => {
    const pending = aTransaction().with({ reference: REFERENCE }).build();
    const { sync, gateway, views } = setup(pending);
    await chargeInGateway(gateway, pending);

    const result = await new GetTransaction(sync, views).execute(TRANSACTION_ID);

    expect(result.ok && result.value.transaction.status).toBe('APPROVED');
    expect(result.ok && result.value.deliveryId).toEqual(expect.any(String));
  });
});
