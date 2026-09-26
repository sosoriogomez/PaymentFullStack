import { type DomainError } from '../../kernel/domain-error';
import { type Result } from '../../kernel/result';
import { DomainErrorException } from './domain-error.exception';

/**
 * Only for controllers: returns the value or throws so the global filter maps the error.
 * Use cases never throw; exceptions exist only at the framework boundary.
 */
export function unwrapOrThrow<T>(result: Result<T, DomainError>): T {
  if (result.ok) return result.value;
  throw new DomainErrorException(result.error);
}
