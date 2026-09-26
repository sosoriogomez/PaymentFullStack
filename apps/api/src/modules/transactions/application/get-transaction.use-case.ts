import { AsyncResult } from '../../../shared/kernel/async-result';
import { type DomainError } from '../../../shared/kernel/domain-error';
import { type Result } from '../../../shared/kernel/result';
import { type SyncTransactionStatus } from './sync-transaction-status.use-case';
import { type TransactionView, type TransactionViews } from './transaction-views';

/**
 * `GET /transactions/:id`: safe and idempotent for the client (M-11). A PENDING transaction is
 * synced first, so each poll can bring the final status, the stock change and the delivery.
 */
export class GetTransaction {
  constructor(
    private readonly sync: SyncTransactionStatus,
    private readonly views: TransactionViews,
  ) {}

  async execute(transactionId: string): Promise<Result<TransactionView, DomainError>> {
    return await AsyncResult.from(this.sync.execute(transactionId)).map(({ transaction }) =>
      this.views.of(transaction),
    );
  }
}
