import { randomUUID } from 'node:crypto';
import { PRODUCT_SEEDS, seedProducts } from '../../src/database/seeds/products.seed';
import { PAYMENT_GATEWAY } from '../../src/modules/payment-gateway/domain/payment-gateway.port';
import { DELIVERY, PAYMENT } from '../builders/transaction.builder';
import { FakePaymentGateway } from '../fakes/fake-payment-gateway';
import { createTestApp, type TestApp } from '../support/test-app';

describe('GET /api/v1/deliveries/:id', () => {
  let testApp: TestApp;
  const product = PRODUCT_SEEDS.find((seed) => seed.stock >= 5)!;

  beforeAll(async () => {
    testApp = await createTestApp({
      customize: (builder) =>
        builder.overrideProvider(PAYMENT_GATEWAY).useValue(new FakePaymentGateway()),
    });
    await seedProducts(testApp.dataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  /** Buys and polls once: the fake gateway approves on the first read. */
  const approvedPurchase = async () => {
    const customer = await testApp
      .api()
      .post('/api/v1/customers')
      .send({ fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' });
    const created = await testApp
      .api()
      .post('/api/v1/transactions')
      .set('Idempotency-Key', randomUUID())
      .send({
        productId: product.id,
        quantity: 2,
        customerId: customer.body.id,
        delivery: { ...DELIVERY, recipientPhone: '3109876543' },
        payment: PAYMENT,
      });
    return (await testApp.api().get(`/api/v1/transactions/${created.body.id}`)).body as {
      id: string;
      deliveryId: string;
    };
  };

  it('should show the assigned delivery with the address and a masked phone', async () => {
    const transaction = await approvedPurchase();

    const response = await testApp.api().get(`/api/v1/deliveries/${transaction.deliveryId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: transaction.deliveryId,
      transactionId: transaction.id,
      productId: product.id,
      quantity: 2,
      status: 'ASSIGNED',
      recipient: { name: DELIVERY.recipientName, phone: '***6543' },
      address: {
        addressLine1: DELIVERY.addressLine1,
        addressLine2: DELIVERY.addressLine2,
        city: DELIVERY.city,
        region: DELIVERY.region,
        country: 'CO',
        postalCode: DELIVERY.postalCode,
      },
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(JSON.stringify(response.body)).not.toContain('3109876543');
  });

  it('should answer 404 for an unknown delivery and 400 for a malformed id', async () => {
    const missing = await testApp.api().get(`/api/v1/deliveries/${randomUUID()}`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('DELIVERY_NOT_FOUND');

    expect((await testApp.api().get('/api/v1/deliveries/abc')).status).toBe(400);
  });
});
