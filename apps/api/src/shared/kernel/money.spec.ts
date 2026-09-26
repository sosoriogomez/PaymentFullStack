import { Money } from './money';
import { err, ok } from './result';

const cop = (cents: number) => {
  const result = Money.of(cents, 'COP');
  if (!result.ok) throw new Error('invalid money in test');
  return result.value;
};

describe('Money', () => {
  it.each([0, 1, 150_000_00, Number.MAX_SAFE_INTEGER])('should accept %p cents', (cents) => {
    expect(Money.of(cents, 'COP')).toEqual(
      ok(expect.objectContaining({ amountInCents: cents, currency: 'COP' })),
    );
  });

  it.each([-1, 10.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'should reject %p cents',
    (cents) => {
      expect(Money.of(cents, 'COP')).toEqual(
        err({
          code: 'VALIDATION_ERROR',
          details: [{ field: 'amountInCents', message: 'must be a non-negative safe integer' }],
        }),
      );
    },
  );

  it('should add amounts of the same currency', () => {
    expect(cop(150_000_00).add(cop(3_000_00))).toEqual(ok(cop(153_000_00)));
  });

  it.each(['cop', 'PESOS', ''])('should reject the currency code %p', (currency) => {
    expect(Money.of(1, currency)).toEqual(
      err({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'currency', message: 'must be an ISO 4217 code' }],
      }),
    );
  });

  it('should refuse to add different currencies', () => {
    const foreign = Money.of(1, 'USD');
    if (!foreign.ok) throw new Error('unexpected');

    expect(cop(1).add(foreign.value)).toEqual(
      err({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'currency', message: 'cannot add USD to COP' }],
      }),
    );
  });

  it('should fail instead of overflowing', () => {
    expect(cop(Number.MAX_SAFE_INTEGER).add(cop(1)).ok).toBe(false);
  });

  it('should multiply by a non-negative integer factor', () => {
    expect(cop(150_000_00).multiply(3)).toEqual(ok(cop(450_000_00)));
    expect(cop(150_000_00).multiply(0)).toEqual(ok(Money.zero('COP')));
  });

  it.each([-1, 1.5])('should reject the factor %p', (factor) => {
    expect(cop(100).multiply(factor)).toEqual(
      err({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'factor', message: 'must be a non-negative integer' }],
      }),
    );
  });

  it('should sum several amounts', () => {
    expect(Money.sum(cop(150_000_00), cop(3_000_00), cop(10_000_00))).toEqual(ok(cop(163_000_00)));
    expect(Money.sum(cop(7))).toEqual(ok(cop(7)));
  });

  it('should compare by value', () => {
    expect(cop(10).equals(cop(10))).toBe(true);
    expect(cop(10).equals(cop(11))).toBe(false);
  });
});
