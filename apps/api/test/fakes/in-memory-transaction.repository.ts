import { type Transaction } from '../../src/modules/transactions/domain/transaction';
import {
  type InsertPendingOutcome,
  type TransactionRepository,
} from '../../src/modules/transactions/domain/transaction.repository.port';

/** Same contract as the Postgres adapter: unique idempotency key and optimistic PENDING guard. */
export class InMemoryTransactionRepository implements TransactionRepository {
  private readonly byId = new Map<string, Transaction>();

  constructor(transactions: readonly Transaction[] = []) {
    transactions.forEach((transaction) => this.byId.set(transaction.id, transaction));
  }

  get all(): Transaction[] {
    return [...this.byId.values()];
  }

  insertPending(transaction: Transaction): Promise<InsertPendingOutcome> {
    const taken = this.all.some((stored) => stored.idempotencyKey === transaction.idempotencyKey);
    if (!taken) this.byId.set(transaction.id, transaction);
    return Promise.resolve(taken ? 'duplicate-idempotency-key' : 'inserted');
  }

  updateIfPending(transaction: Transaction): Promise<boolean> {
    const stored = this.byId.get(transaction.id);
    const pending = stored?.status === 'PENDING';
    if (pending) this.byId.set(transaction.id, transaction);
    return Promise.resolve(pending);
  }

  findById(id: string): Promise<Transaction | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null> {
    return Promise.resolve(
      this.all.find((stored) => stored.idempotencyKey === idempotencyKey) ?? null,
    );
  }
}
