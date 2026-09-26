import { type DomainError, validationError } from '../../../shared/kernel/domain-error';
import { err, ok, type Result } from '../../../shared/kernel/result';

/** Units per order: enough for a real purchase, low enough to stop abuse of the stock. */
export const MAX_QUANTITY_PER_ORDER = 10;

export class Quantity {
  private constructor(readonly value: number) {}

  static of(value: number): Result<Quantity, DomainError> {
    if (!Number.isInteger(value) || value < 1 || value > MAX_QUANTITY_PER_ORDER) {
      return err(
        validationError('quantity', `must be an integer between 1 and ${MAX_QUANTITY_PER_ORDER}`),
      );
    }
    return ok(new Quantity(value));
  }
}
