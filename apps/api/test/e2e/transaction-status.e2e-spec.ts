import { randomUUID } from 'node:crypto';
import { PRODUCT_SEEDS, seedProducts } from '../../src/database/seeds/products.seed';
import { PAYMENT_GATEWAY } from '../../src/modules/payment-gateway/domain/payment-gateway.port';
import { DELIVERY, PAYMENT } from '../builders/transaction.builder';
import { FakePaymentGateway } from '../fakes/fake-payment-gateway';
import { createTestApp, type TestApp } from '../support/test-app';

describe('GET /api/v1/transactions/:id', () => {
  let testApp: TestApp;
  let customerId: string;
  const gateway = new FakePaymentGateway();
  const product = PRODUCT_SEEDS.find((seed) => seed.stock >= 5)!;

  beforeAll(async () => {
    testApp = await createTestApp({
      customize: (builder) => builder.overrideProvider(PAYMENT_GATEWAY).useValue(gateway),
    });
    await seedProducts(testApp.dataSource);
    const customer = await testApp
      .api()
      .post('/api/v1/customers')
      .send({ fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' });
    customerId = customer.body.id;
  });

  afterEach(() => gateway.recover().willCharge({ initial: 'PENDING', settlesTo: 'APPROVED' }));

  afterAll(async () => {
    await testApp.close();
  });

  const pay = async (quantity = 1) => {
    const response = await testApp
      .api()
      .post('/api/v1/transactions')
      .set('Idempotency-Key', randomUUID())
      .send({ productId: product.id, quantity, customerId, delivery: DELIVERY, payment: PAYMENT });
    return response.body as { id: string; status: string };
  };
  const status = (id: string) => testApp.api().get(`/api/v1/transactions/${id}`);
  const available = async () =>
    (await testApp.api().get(`/api/v1/products/${product.id}/stock`)).body.available as number;

  it('should sync a PENDING transaction: APPROVED, stock updated and delivery assigned', async () => {
    const before = await available();
    const created = await pay(2);
    expect(created.status).toBe('PENDING');

    const response = await status(created.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: created.id,
      status: 'APPROVED',
      deliveryId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(await available()).toBe(before - 2);
  });

  it('should never change a final status nor discount the stock twice', async () => {
    const created = await pay(1);
    const first = await status(created.id);
    const stockAfterFirst = await available();

    const second = await status(created.id);

    expect(second.body).toEqual(first.body);
    expect(await available()).toBe(stockAfterFirst);
  });

  it('should keep the stock and have no delivery when the payment is declined', async () => {
    gateway.willCharge({ initial: 'PENDING', settlesTo: 'DECLINED' });
    const before = await available();
    const created = await pay(1);

    const response = await status(created.id);

    expect(response.body).toMatchObject({ status: 'DECLINED', deliveryId: null });
    expect(await available()).toBe(before);
  });

  it('should stay PENDING (200) while the gateway is unavailable', async () => {
    const created = await pay(1);
    gateway.failOn('read', { code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' });

    const response = await status(created.id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PENDING');
  });

  it('should answer 404 for an unknown transaction and 400 for a malformed id', async () => {
    const missing = await status(randomUUID());
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('TRANSACTION_NOT_FOUND');

    expect((await status('123')).status).toBe(400);
  });
});
