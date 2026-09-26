import { PRODUCT_SEEDS, seedProducts } from '../../src/database/seeds/products.seed';
import { createTestApp, type TestApp } from '../support/test-app';

describe('GET /api/v1/checkout/quote', () => {
  let testApp: TestApp;
  const inStock = PRODUCT_SEEDS.find((seed) => seed.stock >= 2)!;
  const soldOut = PRODUCT_SEEDS.find((seed) => seed.stock === 0)!;

  beforeAll(async () => {
    testApp = await createTestApp();
    await seedProducts(testApp.dataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  const quote = (query: string) => testApp.api().get(`/api/v1/checkout/quote?${query}`);

  it('should return the breakdown with base and delivery fees from configuration', async () => {
    const response = await quote(`productId=${inStock.id}&quantity=2`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      productId: inStock.id,
      quantity: 2,
      amounts: {
        product: inStock.priceInCents * 2,
        baseFee: 300_000,
        deliveryFee: 1_000_000,
        total: inStock.priceInCents * 2 + 1_300_000,
        currency: 'COP',
      },
    });
  });

  it('should answer 409 when the quantity exceeds the stock', async () => {
    const response = await quote(`productId=${soldOut.id}&quantity=1`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', available: 0, requested: 1 });
  });

  it.each([
    'quantity=1',
    `productId=${inStock.id}&quantity=11`,
    `productId=${inStock.id}&quantity=0`,
    'productId=abc&quantity=1',
  ])('should reject the invalid query %p', async (query) => {
    const response = await quote(query);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should answer 404 for unknown products', async () => {
    expect((await quote('productId=00000000-0000-4000-8000-000000000000&quantity=1')).status).toBe(
      404,
    );
  });
});
