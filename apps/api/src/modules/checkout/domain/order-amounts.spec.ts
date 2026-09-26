import { aProduct, cop } from '../../../../test/builders/product.builder';
import { err, ok } from '../../../shared/kernel/result';
import { FlatFeePolicy } from './flat-fee.policy';
import { type FeePolicy } from './fee-policy.port';
import { inCents, priceOrder } from './order-amounts';
import { Quantity } from './quantity';

const flatFees = new FlatFeePolicy({
  baseFeeInCents: 3_000_00,
  deliveryFeeInCents: 10_000_00,
  currency: 'COP',
});
const quantity = (n: number) => {
  const result = Quantity.of(n);
  if (!result.ok) throw new Error('invalid quantity in test');
  return result.value;
};

describe('priceOrder', () => {
  it.each([
    [1, 150_000_00, 150_000_00, 163_000_00],
    [2, 150_000_00, 300_000_00, 313_000_00],
    [10, 99_900_00, 999_000_00, 1_012_000_00],
  ])(
    'with %i unit(s) of %i cents should cost %i + fees = %i',
    (units, price, productAmount, total) => {
      const result = priceOrder(
        { product: aProduct().withPrice(price).build(), quantity: quantity(units) },
        flatFees,
      );

      expect(result.ok && inCents(result.value)).toEqual({
        product: productAmount,
        baseFee: 3_000_00,
        deliveryFee: 10_000_00,
        total,
        currency: 'COP',
      });
    },
  );

  it('should make the total the exact sum of its parts', () => {
    const result = priceOrder(
      { product: aProduct().withPrice(123_457).build(), quantity: quantity(3) },
      flatFees,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { product, baseFee, deliveryFee, total } = inCents(result.value);
    expect(total).toBe(product + baseFee + deliveryFee);
  });

  it('should fail when the fee policy fails', () => {
    const failing: FeePolicy = { feesFor: () => err({ code: 'VALIDATION_ERROR', details: [] }) };

    expect(priceOrder({ product: aProduct().build(), quantity: quantity(1) }, failing)).toEqual(
      err({ code: 'VALIDATION_ERROR', details: [] }),
    );
  });

  it('should refuse fees in another currency', () => {
    const dollars = new FlatFeePolicy({
      baseFeeInCents: 1,
      deliveryFeeInCents: 1,
      currency: 'USD',
    });

    expect(priceOrder({ product: aProduct().build(), quantity: quantity(1) }, dollars).ok).toBe(
      false,
    );
  });
});

describe('FlatFeePolicy', () => {
  it('should charge the configured fees', () => {
    expect(flatFees.feesFor()).toEqual(ok({ baseFee: cop(3_000_00), deliveryFee: cop(10_000_00) }));
  });

  it('should reject invalid configured amounts', () => {
    expect(
      new FlatFeePolicy({ baseFeeInCents: -1, deliveryFeeInCents: 0, currency: 'COP' }).feesFor()
        .ok,
    ).toBe(false);
  });
});

describe('Quantity', () => {
  it.each([1, 5, 10])('should accept %i', (value) => {
    expect(Quantity.of(value).ok).toBe(true);
  });

  it.each([0, 11, 1.5, -2])('should reject %p', (value) => {
    expect(Quantity.of(value)).toEqual(
      err({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'quantity', message: 'must be an integer between 1 and 10' }],
      }),
    );
  });
});
