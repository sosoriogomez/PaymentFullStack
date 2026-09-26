import { type Result } from './result';

declare const transactionContextBrand: unique symbol;

/**
 * Opaque handle of an open database transaction. Use cases pass it to repository methods that
 * must take part in the same unit of work; only persistence adapters know what is inside.
 */
export interface TransactionContext {
  readonly [transactionContextBrand]: never;
}

export interface UnitOfWork {
  /** Commits when `work` returns ok; rolls back when it returns an error or throws. */
  run<T, E>(work: (tx: TransactionContext) => Promise<Result<T, E>>): Promise<Result<T, E>>;
}

export const UNIT_OF_WORK = Symbol('UnitOfWork');
