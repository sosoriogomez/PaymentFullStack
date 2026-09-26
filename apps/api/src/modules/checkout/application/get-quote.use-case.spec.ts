import { aProduct, PRODUCT_ID } from '../../../../test/builders/product.builder';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { err } from '../../../shared/kernel/result';
import { inCents } from '../domain/order-amounts';
import { FlatFeePolicy } from '../infrastructure/flat-fee.policy';
import { GetQuote } from './get-quote.use-case';

const fees = new FlatFeePolicy({
  baseFeeInCents: 3_000_00,
  deliveryFeeInCents: 10_000_00,
  currency: 'COP',
});
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('GetQuote', () => {
  const useCase = new GetQuote(
    new InMemoryProductRepository([aProduct().withStock(3).withPrice(150_000_00).build()]),
    fees,
  );

  it('should price the order when there is stock', async () => {
    const result = await useCase.execute({ productId: PRODUCT_ID, quantity: 2 });

    expect(result.ok && inCents(result.value.amounts)).toEqual({
      product: 300_000_00,
      baseFee: 3_000_00,
      deliveryFee: 10_000_00,
      total: 313_000_00,
      currency: 'COP',
    });
    expect(result.ok && result.value.quantity.value).toBe(2);
  });

  it('should reject quantities above the stock', async () => {
    expect(await useCase.execute({ productId: PRODUCT_ID, quantity: 4 })).toEqual(
      err({ code: 'INSUFFICIENT_STOCK', available: 3, requested: 4 }),
    );
  });

  it('should reject invalid quantities before touching the repository', async () => {
    expect((await useCase.execute({ productId: PRODUCT_ID, quantity: 0 })).ok).toBe(false);
  });

  it('should report unknown products', async () => {
    expect(await useCase.execute({ productId: MISSING_ID, quantity: 1 })).toEqual(
      err({ code: 'PRODUCT_NOT_FOUND', productId: MISSING_ID }),
    );
  });
});
