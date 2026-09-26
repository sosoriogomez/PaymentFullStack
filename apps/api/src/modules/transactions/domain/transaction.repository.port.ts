import { type TransactionContext } from '../../../shared/kernel/unit-of-work';
import { type Transaction } from './transaction';

export type InsertPendingOutcome = 'inserted' | 'duplicate-idempotency-key';

export interface TransactionRepository {
  /**
   * Commits the new PENDING row on its own, before the gateway is called, so there is always
   * something to reconcile. A concurrent request with the same Idempotency-Key gets
   * `duplicate-idempotency-key` (unique constraint) instead of a second row.
   */
  insertPending(transaction: Transaction): Promise<InsertPendingOutcome>;
  /**
   * Writes status and gateway data only while the stored row is still PENDING (optimistic
   * guard). Returns false when another process already finalized it.
   */
  updateIfPending(transaction: Transaction, tx?: TransactionContext): Promise<boolean>;
  findById(id: string, tx?: TransactionContext): Promise<Transaction | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null>;
  findByReference(reference: string): Promise<Transaction | null>;
}

export const TRANSACTION_REPOSITORY = Symbol('TransactionRepository');
