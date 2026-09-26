import { aProduct } from '../../../../test/builders/product.builder';
import { aTransaction, TRANSACTION_ID } from '../../../../test/builders/transaction.builder';
import { InMemoryDeliveryRepository } from '../../../../test/fakes/in-memory-delivery.repository';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { InMemoryTransactionRepository } from '../../../../test/fakes/in-memory-transaction.repository';
import { InMemoryUnitOfWork } from '../../../../test/fakes/in-memory-unit-of-work';
import { FixedClock, SequentialIdGenerator } from '../../../../test/fakes/kernel';
import { err, ok } from '../../../shared/kernel/result';
import {
  type GatewayEvent,
  type PaymentEventVerifier,
} from '../../payment-gateway/domain/payment-event.port';
import { type GatewayTransactionStatus } from '../../payment-gateway/domain/payment-gateway.port';
import { FinalizeTransaction } from './finalize-transaction.use-case';
import { HandlePaymentEvent } from './handle-payment-event.use-case';

const REFERENCE = 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W';
const event = (
  status: GatewayTransactionStatus = 'APPROVED',
  reference = REFERENCE,
  type = 'transaction.updated',
): GatewayEvent => ({
  type,
  transaction: {
    id: 'gw-1',
    reference,
    status,
    statusMessage: null,
    amountInCents: 163_000_00,
    currency: 'COP',
    card: null,
  },
});

/** The verifier port is stubbed: its checksum rules are tested with its adapter. */
const verifierFor = (verified: GatewayEvent | null): PaymentEventVerifier => ({
  verify: () => (verified ? ok(verified) : err({ code: 'INVALID_EVENT_SIGNATURE' })),
});

const setup = (verified: GatewayEvent | null = event()) => {
  const transactions = new InMemoryTransactionRepository([
    aTransaction().with({ reference: REFERENCE }).build(),
  ]);
  const deliveries = new InMemoryDeliveryRepository();
  const products = new InMemoryProductRepository([aProduct().withStock(5).build()]);
  const finalize = new FinalizeTransaction({
    unitOfWork: new InMemoryUnitOfWork(),
    transactions,
    products,
    deliveries,
    ids: new SequentialIdGenerator(),
    clock: new FixedClock(),
    alerts: { warn: jest.fn(), error: jest.fn() },
  });
  const useCase = new HandlePaymentEvent(verifierFor(verified), transactions, finalize);
  return { useCase, transactions, deliveries };
};

describe('HandlePaymentEvent', () => {
  it('should finalize the transaction of an authentic event, once', async () => {
    const { useCase, transactions, deliveries } = setup();

    const first = await useCase.execute({ payload: {} });
    const duplicate = await useCase.execute({ payload: {} });

    expect(first.ok && first.value).toBe('finalized');
    expect(duplicate.ok && duplicate.value).toBe('already-final');
    expect((await transactions.findById(TRANSACTION_ID))?.status).toBe('APPROVED');
    expect(deliveries.all).toHaveLength(1);
  });

  it('should change nothing when the event is not authentic', async () => {
    const { useCase, transactions } = setup(null);

    const result = await useCase.execute({ payload: {}, checksumHeader: 'forged' });

    expect(!result.ok && result.error).toEqual({ code: 'INVALID_EVENT_SIGNATURE' });
    expect((await transactions.findById(TRANSACTION_ID))?.status).toBe('PENDING');
  });

  it.each([
    [
      'another kind of event',
      event('APPROVED', REFERENCE, 'payment_link.updated'),
      'ignored-event',
    ],
    [
      'an event without a transaction',
      { type: 'transaction.updated', transaction: null },
      'ignored-event',
    ],
    ['a transaction still pending', event('PENDING'), 'still-pending'],
    ['a reference we do not know', event('APPROVED', 'TX-NOT-OURS'), 'unknown-reference'],
  ])('should acknowledge %s without changes', async (_, verified, outcome) => {
    const { useCase, transactions } = setup(verified);

    const result = await useCase.execute({ payload: {} });

    expect(result.ok && result.value).toBe(outcome);
    expect((await transactions.findById(TRANSACTION_ID))?.status).toBe('PENDING');
  });
});
