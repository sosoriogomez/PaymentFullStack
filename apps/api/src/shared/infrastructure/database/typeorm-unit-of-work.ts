import { type DataSource, type EntityManager } from 'typeorm';
import { type Result } from '../../kernel/result';
import { type TransactionContext, type UnitOfWork } from '../../kernel/unit-of-work';

interface TypeOrmTransactionContext {
  readonly manager: EntityManager;
}

const contextFor = (manager: EntityManager): TransactionContext =>
  ({ manager }) satisfies TypeOrmTransactionContext as unknown as TransactionContext;

/** The EntityManager of the open transaction, or the default one outside a unit of work. */
export const managerFor = (dataSource: DataSource, tx?: TransactionContext): EntityManager =>
  tx ? (tx as unknown as TypeOrmTransactionContext).manager : dataSource.manager;

export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  async run<T, E>(work: (tx: TransactionContext) => Promise<Result<T, E>>): Promise<Result<T, E>> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const result = await work(contextFor(runner.manager));
      await (result.ok ? runner.commitTransaction() : runner.rollbackTransaction());
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
