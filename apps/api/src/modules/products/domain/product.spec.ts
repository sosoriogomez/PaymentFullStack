import { aProduct } from '../../../../test/builders/product.builder';
import { err, ok } from '../../../shared/kernel/result';

describe('Product', () => {
  it('should expose its catalog data', () => {
    const product = aProduct().withStock(7).withPrice(99_900_00).build();

    expect(product.stock).toBe(7);
    expect(product.price.amountInCents).toBe(99_900_00);
    expect(product.imageKey).toBe('wireless-headphones');
    expect(product.name).toBe('Audífonos inalámbricos Pulse');
    expect(product.description).toBe('Cancelación activa de ruido.');
    expect(product.sku).toBe('AUD-001');
  });

  it.each([
    [5, 1, true],
    [5, 5, true],
    [5, 6, false],
    [0, 1, false],
  ])('with stock %i, hasStock(%i) should be %p', (stock, quantity, expected) => {
    expect(aProduct().withStock(stock).build().hasStock(quantity)).toBe(expected);
  });

  it('should explain how many units are available when stock is insufficient', () => {
    const product = aProduct().withStock(2).build();

    expect(product.ensureStockFor(2)).toEqual(ok(product));
    expect(product.ensureStockFor(3)).toEqual(
      err({ code: 'INSUFFICIENT_STOCK', available: 2, requested: 3 }),
    );
  });
});
