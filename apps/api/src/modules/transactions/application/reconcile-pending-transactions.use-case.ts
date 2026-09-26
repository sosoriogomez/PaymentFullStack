import { type AlertLog, type Clock } from '../../../shared/kernel/ports';
import { EXPIRED_WITHOUT_GATEWAY_RECORD, type Transaction } from '../domain/transaction';
import { type TransactionRepository } from '../domain/transaction.repository.port';
import { type SyncResult, type SyncTransactionStatus } from './sync-transaction-status.use-case';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;

export interface ReconciliationSettings {
  /** Younger PENDING are left to the client's polling. */
  readonly minAgeSeconds: number;
  readonly batchSize: number;
  /** A PENDING the gateway never saw becomes ERROR after this long. */
  readonly pendingExpirationMinutes: number;
}

export interface ReconciliationSummary {
  readonly scanned: number;
  readonly finalized: number;
  readonly expired: number;
  readonly failed: number;
}

type Tally = 'finalized' | 'expired' | 'failed' | 'untouched';

/**
 * Scheduled every 5 minutes (C-03, ADR-007): no PENDING depends on the customer keeping the page
 * open. Same path as the polling (SyncTransactionStatus), so it is idempotent with it and with the
 * webhook. Runs in series (a pool of 2 connections) and one failure never stops the batch.
 */
export class ReconcilePendingTransactions {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly sync: SyncTransactionStatus,
    private readonly clock: Clock,
    private readonly alerts: AlertLog,
    private readonly settings: ReconciliationSettings,
  ) {}

  async execute(): Promise<ReconciliationSummary> {
    const now = this.clock.now().getTime();
    const cutoff = new Date(now - this.settings.minAgeSeconds * MS_PER_SECOND);
    const expiredBefore = new Date(now - this.settings.pendingExpirationMinutes * MS_PER_MINUTE);
    const pending = await this.transactions.findPendingOlderThan(cutoff, this.settings.batchSize);
    const summary = { scanned: pending.length, finalized: 0, expired: 0, failed: 0 };
    for (const transaction of pending) {
      const tally = await this.reconcile(transaction, expiredBefore).catch((error: unknown) =>
        this.reportFailure(transaction, error),
      );
      if (tally !== 'untouched') summary[tally] += 1;
    }
    return summary;
  }

  private async reconcile(transaction: Transaction, expiredBefore: Date): Promise<Tally> {
    const synced = await this.sync.execute(transaction.id);
    if (!synced.ok) return 'failed';
    return this.tallyOf(synced.value.result, transaction, expiredBefore);
  }

  private async tallyOf(
    result: SyncResult,
    transaction: Transaction,
    expiredBefore: Date,
  ): Promise<Tally> {
    switch (result) {
      case 'finalized':
        return 'finalized';
      case 'gateway-unavailable':
        return 'failed';
      case 'gateway-missing':
        return transaction.createdAt < expiredBefore ? this.expire(transaction) : 'untouched';
      case 'already-final':
      case 'gateway-pending':
        return 'untouched';
    }
  }

  private reportFailure(transaction: Transaction, error: unknown): Tally {
    this.alerts.error('RECONCILIATION_FAILED', {
      transactionId: transaction.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return 'failed';
  }

  /** No stock or delivery to undo: only APPROVED ever touches them. */
  private async expire(transaction: Transaction): Promise<Tally> {
    const expired = transaction.finalize(
      { status: 'ERROR', statusMessage: EXPIRED_WITHOUT_GATEWAY_RECORD },
      this.clock.now(),
    );
    if (!expired.ok) return 'untouched';
    return (await this.transactions.updateIfPending(expired.value)) ? 'expired' : 'untouched';
  }
}
