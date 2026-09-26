import { type DomainError } from '../../../shared/kernel/domain-error';
import { map, ok, type Result } from '../../../shared/kernel/result';
import {
  type PaymentEventVerifier,
  TRANSACTION_UPDATED,
} from '../../payment-gateway/domain/payment-event.port';
import { isFinalGatewayTransaction } from '../../payment-gateway/domain/payment-gateway.port';
import { type TransactionRepository } from '../domain/transaction.repository.port';
import { type FinalizeTransaction } from './finalize-transaction.use-case';

export type PaymentEventOutcome =
  'finalized' | 'already-final' | 'ignored-event' | 'still-pending' | 'unknown-reference';

export interface PaymentEventInput {
  readonly payload: unknown;
  readonly checksumHeader?: string | undefined;
}

/**
 * Webhook `transaction.updated` (spec §5.4), the complement to polling and reconciliation:
 * verify → ignore other events → find by reference → FinalizeTransaction (same I-06 invariant,
 * idempotent). Every valid event is acknowledged, so the gateway does not retry it.
 */
export class HandlePaymentEvent {
  constructor(
    private readonly verifier: PaymentEventVerifier,
    private readonly transactions: TransactionRepository,
    private readonly finalize: FinalizeTransaction,
  ) {}

  async execute(input: PaymentEventInput): Promise<Result<PaymentEventOutcome, DomainError>> {
    const verified = this.verifier.verify(input.payload, input.checksumHeader);
    if (!verified.ok) return verified;
    const { type, transaction: record } = verified.value;
    if (type !== TRANSACTION_UPDATED || !record) return ok('ignored-event');
    if (!isFinalGatewayTransaction(record)) return ok('still-pending');
    const transaction = await this.transactions.findByReference(record.reference);
    if (!transaction) return ok('unknown-reference');
    const finalized = await this.finalize.execute({ transactionId: transaction.id, record });
    return map(finalized, ({ changed }) => (changed ? 'finalized' : 'already-final'));
  }
}
