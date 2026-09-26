import { PRODUCT_SEEDS, seedProducts } from '../../src/database/seeds/products.seed';
import { createTestApp, type TestApp } from '../support/test-app';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Products API', () => {
  let testApp: TestApp;
  const seed = PRODUCT_SEEDS[0]!;

  beforeAll(async () => {
    testApp = await createTestApp();
    await seedProducts(testApp.dataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /products should list the seeded catalog without caching', async () => {
    const response = await testApp.api().get('/api/v1/products');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.items).toHaveLength(PRODUCT_SEEDS.length);
    expect(response.body.items[0]).toEqual({
      id: seed.id,
      name: seed.name,
      description: seed.description,
      priceInCents: seed.priceInCents,
      currency: 'COP',
      stock: seed.stock,
      imageKey: seed.imageKey,
    });
  });

  it('GET /products?limit should bound the page size', async () => {
    const two = await testApp.api().get('/api/v1/products?limit=2');
    const tooMany = await testApp.api().get('/api/v1/products?limit=51');
    const notANumber = await testApp.api().get('/api/v1/products?limit=abc');

    expect(two.body.items).toHaveLength(2);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.details[0].field).toBe('limit');
    expect(notANumber.status).toBe(400);
  });

  it('GET /products/:id should return one product', async () => {
    const response = await testApp.api().get(`/api/v1/products/${seed.id}`);

    expect(response.status).toBe(200);
    expect(response.body.name).toBe(seed.name);
  });

  it('GET /products/:id should answer 404 problem details for unknown products', async () => {
    const response = await testApp.api().get(`/api/v1/products/${MISSING_ID}`);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(response.body).toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      detail: `Product ${MISSING_ID} was not found`,
    });
  });

  it('GET /products/:id should reject ids that are not UUID v4', async () => {
    const response = await testApp.api().get('/api/v1/products/abc');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'id', message: 'must be a UUID v4' }],
    });
  });

  it('GET /products/:id/stock should return the available units', async () => {
    const response = await testApp.api().get(`/api/v1/products/${seed.id}/stock`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      productId: seed.id,
      available: seed.stock,
      updatedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(response.body.updatedAt))).toBe(false);
  });

  it('GET /products/:id/stock should answer 404 for unknown products', async () => {
    expect((await testApp.api().get(`/api/v1/products/${MISSING_ID}/stock`)).status).toBe(404);
  });
});
