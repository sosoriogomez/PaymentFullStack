import { type DomainError, validationError } from '../../../shared/kernel/domain-error';
import { err, ok, type Result } from '../../../shared/kernel/result';

/** Credit card installments accepted by the gateway. */
export const MAX_INSTALLMENTS = 36;

export class Installments {
  private constructor(readonly value: number) {}

  static of(value: number): Result<Installments, DomainError> {
    return Number.isInteger(value) && value >= 1 && value <= MAX_INSTALLMENTS
      ? ok(new Installments(value))
      : err(
          validationError(
            'payment.installments',
            `must be an integer between 1 and ${MAX_INSTALLMENTS}`,
          ),
        );
  }
}
