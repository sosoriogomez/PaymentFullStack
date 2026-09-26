import { type DataSource } from 'typeorm';
import { managerFor } from '../../../../shared/infrastructure/database/typeorm-unit-of-work';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/unique-violation';
import { type TransactionContext } from '../../../../shared/kernel/unit-of-work';
import { type Transaction } from '../../domain/transaction';
import {
  type InsertPendingOutcome,
  type TransactionRepository,
} from '../../domain/transaction.repository.port';
import { toRow, toTransaction } from './transaction.mapper';
import { IDEMPOTENCY_KEY_CONSTRAINT, TransactionOrmEntity } from './transaction.orm-entity';

export class TypeOrmTransactionRepository implements TransactionRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Postgres makes a concurrent INSERT with the same key wait for the first one to commit and
   * then fail with a unique violation: the first request wins, the second one replays it.
   */
  async insertPending(transaction: Transaction): Promise<InsertPendingOutcome> {
    try {
      await this.repository().insert(toRow(transaction));
      return 'inserted';
    } catch (error) {
      if (isUniqueViolation(error, IDEMPOTENCY_KEY_CONSTRAINT)) return 'duplicate-idempotency-key';
      throw error;
    }
  }

  async updateIfPending(transaction: Transaction, tx?: TransactionContext): Promise<boolean> {
    const { status, statusMessage, gatewayTransactionId, cardBrand, cardLastFour, finalizedAt } =
      toRow(transaction);
    const result = await this.repository(tx)
      .createQueryBuilder()
      .update()
      .set({ status, statusMessage, gatewayTransactionId, cardBrand, cardLastFour, finalizedAt })
      .where('id = :id AND status = :pending', { id: transaction.id, pending: 'PENDING' })
      .execute();
    return result.affected === 1;
  }

  async findById(id: string, tx?: TransactionContext): Promise<Transaction | null> {
    const row = await this.repository(tx).findOneBy({ id });
    return row ? toTransaction(row) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Transaction | null> {
    const row = await this.repository().findOneBy({ idempotencyKey });
    return row ? toTransaction(row) : null;
  }

  async findByReference(reference: string): Promise<Transaction | null> {
    const row = await this.repository().findOneBy({ reference });
    return row ? toTransaction(row) : null;
  }

  private repository(tx?: TransactionContext) {
    return managerFor(this.dataSource, tx).getRepository(TransactionOrmEntity);
  }
}
