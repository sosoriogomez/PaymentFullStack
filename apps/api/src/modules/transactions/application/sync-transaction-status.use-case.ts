import { type DomainError } from '../../../shared/kernel/domain-error';
import { err, map, ok, type Result } from '../../../shared/kernel/result';
import {
  type GatewayError,
  type GatewayTransaction,
  isFinalGatewayTransaction,
  type PaymentGateway,
} from '../../payment-gateway/domain/payment-gateway.port';
import { type Transaction } from '../domain/transaction';
import { type TransactionRepository } from '../domain/transaction.repository.port';
import { type FinalizeTransaction } from './finalize-transaction.use-case';

export type SyncResult =
  'already-final' | 'finalized' | 'gateway-pending' | 'gateway-missing' | 'gateway-unavailable';

export interface SyncOutcome {
  readonly transaction: Transaction;
  /** What the sync found; the reconciliation (BE-14) counts and expires with it. */
  readonly result: SyncResult;
}

/**
 * Makes our copy converge with the gateway (spec §5.3): by gateway id when we have it, by
 * reference otherwise (the POST answer was lost). An unreachable gateway is not an error for the
 * caller: the transaction simply stays PENDING and the next poll or reconciliation retries.
 */
export class SyncTransactionStatus {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly gateway: PaymentGateway,
    private readonly finalize: FinalizeTransaction,
  ) {}

  async execute(transactionId: string): Promise<Result<SyncOutcome, DomainError>> {
    const transaction = await this.transactions.findById(transactionId);
    if (!transaction) return err({ code: 'TRANSACTION_NOT_FOUND', by: 'id', value: transactionId });
    if (transaction.isFinal) return ok({ transaction, result: 'already-final' });
    return this.syncPending(transaction);
  }

  private async syncPending(transaction: Transaction): Promise<Result<SyncOutcome, DomainError>> {
    const found = await this.lookup(transaction);
    if (!found.ok) return ok({ transaction, result: 'gateway-unavailable' });
    const record = found.value;
    if (!record) return ok({ transaction, result: 'gateway-missing' });
    if (!isFinalGatewayTransaction(record)) {
      return ok({
        transaction: await this.rememberGatewayId(transaction, record),
        result: 'gateway-pending',
      });
    }
    const finalized = await this.finalize.execute({ transactionId: transaction.id, record });
    return map(finalized, ({ transaction: final, changed }) => ({
      transaction: final,
      result: changed ? 'finalized' : 'already-final',
    }));
  }

  private lookup(
    transaction: Transaction,
  ): Promise<Result<GatewayTransaction | null, GatewayError>> {
    return transaction.gatewayTransactionId
      ? this.gateway.getTransaction(transaction.gatewayTransactionId)
      : this.gateway.findTransactionByReference(transaction.reference);
  }

  /** Found by reference and still PENDING: keep its id so the next reads go straight to it. */
  private async rememberGatewayId(
    transaction: Transaction,
    record: GatewayTransaction,
  ): Promise<Transaction> {
    if (transaction.gatewayTransactionId || !transaction.matchesCharge(record)) return transaction;
    const charged = transaction.recordCharge({
      gatewayTransactionId: record.id,
      card: record.card,
    });
    if (!charged.ok) return transaction;
    const saved = await this.transactions.updateIfPending(charged.value);
    return saved ? charged.value : transaction;
  }
}
