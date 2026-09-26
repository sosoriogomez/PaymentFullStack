import { type Result } from '../../kernel/result';

/**
 * Only for mappers that rebuild domain objects from our own database: the schema constraints
 * already guarantee the invariants, so a failure here means corrupted data and must be loud.
 */
export function trusted<T, E>(result: Result<T, E>, what: string): T {
  if (result.ok) return result.value;
  throw new Error(`Corrupted persisted data: ${what} (${JSON.stringify(result.error)})`);
}
