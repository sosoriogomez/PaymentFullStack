import { type DomainError } from '../../kernel/domain-error';

/** Carries a DomainError across the HTTP boundary; ProblemDetailsFilter turns it into a response. */
export class DomainErrorException extends Error {
  override readonly name = 'DomainErrorException';

  constructor(readonly error: DomainError) {
    super(error.code);
  }
}
