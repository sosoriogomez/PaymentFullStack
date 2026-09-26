import { type DomainError } from '../../../shared/kernel/domain-error';
import { err, ok, type Result } from '../../../shared/kernel/result';
import { type TransactionRepository } from '../domain/transaction.repository.port';
import { type TransactionView, type TransactionViews } from './transaction-views';

/**
 * Recovery after a refresh during the POST (C-04): the client asks whether its key already
 * produced a transaction before sending the payment again with the same key.
 */
export class FindTransactionByIdempotencyKey {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly views: TransactionViews,
  ) {}

  async execute(idempotencyKey: string): Promise<Result<TransactionView, DomainError>> {
    const transaction = await this.transactions.findByIdempotencyKey(idempotencyKey);
    return transaction
      ? ok(await this.views.of(transaction))
      : err({ code: 'TRANSACTION_NOT_FOUND', by: 'idempotencyKey', value: idempotencyKey });
  }
}
