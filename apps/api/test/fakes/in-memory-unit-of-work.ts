import { type Result } from '../../src/shared/kernel/result';
import { type TransactionContext, type UnitOfWork } from '../../src/shared/kernel/unit-of-work';

/** Runs the work as is: in-memory fakes have no transactions (atomicity is tested on Postgres). */
export class InMemoryUnitOfWork implements UnitOfWork {
  runs = 0;

  run<T, E>(work: (tx: TransactionContext) => Promise<Result<T, E>>): Promise<Result<T, E>> {
    this.runs += 1;
    return work({} as TransactionContext);
  }
}
