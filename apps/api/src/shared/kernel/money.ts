import { type DomainError, validationError } from './domain-error';
import { andThen, err, ok, type Result } from './result';

/** ISO 4217 alphabetic code, e.g. `COP`. */
export type CurrencyCode = string;

const ISO_CURRENCY = /^[A-Z]{3}$/;
const isValidAmount = (cents: number): boolean => Number.isSafeInteger(cents) && cents >= 0;

/** Money in integer cents. Never floats; operations that could overflow or mix currencies fail. */
export class Money {
  private constructor(
    readonly amountInCents: number,
    readonly currency: CurrencyCode,
  ) {}

  static of(amountInCents: number, currency: CurrencyCode): Result<Money, DomainError> {
    if (!isValidAmount(amountInCents)) {
      return err(validationError('amountInCents', 'must be a non-negative safe integer'));
    }
    if (!ISO_CURRENCY.test(currency)) {
      return err(validationError('currency', 'must be an ISO 4217 code'));
    }
    return ok(new Money(amountInCents, currency));
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(0, currency);
  }

  static sum(first: Money, ...rest: readonly Money[]): Result<Money, DomainError> {
    return rest.reduce<Result<Money, DomainError>>(
      (total, next) => andThen(total, (money) => money.add(next)),
      ok(first),
    );
  }

  add(other: Money): Result<Money, DomainError> {
    if (other.currency !== this.currency) {
      return err(validationError('currency', `cannot add ${other.currency} to ${this.currency}`));
    }
    return Money.of(this.amountInCents + other.amountInCents, this.currency);
  }

  multiply(factor: number): Result<Money, DomainError> {
    if (!Number.isSafeInteger(factor) || factor < 0) {
      return err(validationError('factor', 'must be a non-negative integer'));
    }
    return Money.of(this.amountInCents * factor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amountInCents === other.amountInCents && this.currency === other.currency;
  }
}
