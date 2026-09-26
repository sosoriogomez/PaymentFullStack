import { randomUUID } from 'node:crypto';
import { PRODUCT_SEEDS, seedProducts } from '../../src/database/seeds/products.seed';
import { PAYMENT_GATEWAY } from '../../src/modules/payment-gateway/domain/payment-gateway.port';
import { DELIVERY, PAYMENT } from '../builders/transaction.builder';
import { FAKE_CARD, FakePaymentGateway } from '../fakes/fake-payment-gateway';
import { createTestApp, type TestApp } from '../support/test-app';

describe('POST /api/v1/transactions', () => {
  let testApp: TestApp;
  let customerId: string;
  const gateway = new FakePaymentGateway();
  const product = PRODUCT_SEEDS.find((seed) => seed.stock >= 5)!;
  const soldOut = PRODUCT_SEEDS.find((seed) => seed.stock === 0)!;

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

  const body = (overrides: Record<string, unknown> = {}) => ({
    productId: product.id,
    quantity: 2,
    customerId,
    delivery: DELIVERY,
    payment: PAYMENT,
    ...overrides,
  });
  const create = (key: string | null, payload: object = body()) => {
    const request = testApp.api().post('/api/v1/transactions');
    return (key ? request.set('Idempotency-Key', key) : request).send(payload);
  };
  const chargesFor = (reference: string) =>
    gateway.charges.filter((charge) => charge.reference === reference);

  it('should create a PENDING transaction with its number, charge it and keep the stock', async () => {
    const response = await create(randomUUID());

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/transactions/${response.body.id}`);
    expect(response.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      reference: expect.stringMatching(/^TX-[0-9A-Z]{26}$/),
      status: 'PENDING',
      statusMessage: null,
      amounts: {
        product: product.priceInCents * 2,
        baseFee: 300_000,
        deliveryFee: 1_000_000,
        total: product.priceInCents * 2 + 1_300_000,
        currency: 'COP',
      },
      product: { id: product.id, name: product.name, quantity: 2 },
      card: FAKE_CARD,
      deliveryId: null,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(chargesFor(response.body.reference)).toHaveLength(1);
    const stock = await testApp.api().get(`/api/v1/products/${product.id}/stock`);
    expect(stock.body.available).toBe(product.stock);
  });

  it('should never echo the card or acceptance tokens', async () => {
    const response = await create(randomUUID());

    const echoed = JSON.stringify(response.body);
    expect(echoed).not.toContain(PAYMENT.cardToken);
    expect(echoed).not.toContain(PAYMENT.acceptanceToken);
  });

  describe('idempotency', () => {
    it('should replay the same key with 200 and Idempotent-Replayed, without a second charge', async () => {
      const key = randomUUID();
      const first = await create(key);

      const second = await create(key);

      expect(second.status).toBe(200);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.headers.location).toBe(`/api/v1/transactions/${first.body.id}`);
      expect(second.body.id).toBe(first.body.id);
      expect(chargesFor(first.body.reference)).toHaveLength(1);
    });

    it('should replay when the card was entered again with the same key (C-04)', async () => {
      const key = randomUUID();
      const first = await create(key);

      const retry = await create(key, body({ payment: { ...PAYMENT, cardToken: 'tok_again' } }));

      expect(retry.status).toBe(200);
      expect(retry.body.id).toBe(first.body.id);
      expect(chargesFor(first.body.reference)).toHaveLength(1);
    });

    it('should answer 422 when the key is reused for another purchase', async () => {
      const key = randomUUID();
      await create(key);

      const response = await create(key, body({ quantity: 1 }));

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 422 });
    });

    it.each([
      [null, 'missing'],
      ['not-a-uuid', 'malformed'],
      ['7b1d3f0e-8c2a-1b5d-9e6f-0a1b2c3d4e5f', 'not a v4'],
    ])('should answer 400 when the Idempotency-Key is %s (%s)', async (key, _case) => {
      const response = await create(key);

      expect(response.status).toBe(400);
      expect(response.body.details).toEqual([
        { field: 'Idempotency-Key', message: 'header is required and must be a UUID v4' },
      ]);
    });
  });

  describe('validation', () => {
    it.each([
      ['amounts sent by the client', body({ amountInCents: 1 })],
      ['no delivery', body({ delivery: undefined })],
      ['no payment', body({ payment: undefined })],
      ['a foreign country', body({ delivery: { ...DELIVERY, country: 'US' } })],
      ['a landline recipient', body({ delivery: { ...DELIVERY, recipientPhone: '6041234567' } })],
      ['37 installments', body({ payment: { ...PAYMENT, installments: 37 } })],
      ['an unknown payment field', body({ payment: { ...PAYMENT, cvc: '123' } })],
      ['11 units', body({ quantity: 11 })],
    ])('should answer 400 for %s', async (_, payload) => {
      const response = await create(randomUUID(), payload);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should answer 409 without charging when there is not enough stock', async () => {
      const before = gateway.charges.length;

      const response = await create(randomUUID(), body({ productId: soldOut.id, quantity: 1 }));

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', available: 0 });
      expect(gateway.charges).toHaveLength(before);
    });

    it('should answer 404 for an unknown customer', async () => {
      const response = await create(randomUUID(), body({ customerId: randomUUID() }));

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
    });
  });

  describe('gateway answers', () => {
    it('should answer 201 with status ERROR when the gateway rejects the charge', async () => {
      gateway.failOn('charge', { code: 'GATEWAY_REJECTED', reason: 'INPUT_VALIDATION_ERROR' });

      const response = await create(randomUUID());

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'ERROR',
        statusMessage: 'INPUT_VALIDATION_ERROR',
        card: null,
      });
    });

    it('should answer 201 PENDING when the gateway does not answer in time', async () => {
      gateway.failOn('charge', { code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' });

      const response = await create(randomUUID());

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'PENDING', card: null });
    });
  });
});

describe('GET /api/v1/transactions?idempotencyKey=', () => {
  let testApp: TestApp;
  const gateway = new FakePaymentGateway();
  const product = PRODUCT_SEEDS.find((seed) => seed.stock >= 5)!;

  beforeAll(async () => {
    testApp = await createTestApp({
      customize: (builder) => builder.overrideProvider(PAYMENT_GATEWAY).useValue(gateway),
    });
    await seedProducts(testApp.dataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  const find = (key: string) => testApp.api().get(`/api/v1/transactions?idempotencyKey=${key}`);

  it('should find the transaction created with the key', async () => {
    const customer = await testApp
      .api()
      .post('/api/v1/customers')
      .send({ fullName: 'Luis Gómez', email: 'luis@mail.com', phone: '3109876543' });
    const key = randomUUID();
    const created = await testApp
      .api()
      .post('/api/v1/transactions')
      .set('Idempotency-Key', key)
      .send({
        productId: product.id,
        quantity: 1,
        customerId: customer.body.id,
        delivery: DELIVERY,
        payment: PAYMENT,
      });

    const response = await find(key.toUpperCase());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
  });

  it('should answer 404 for a key that was never used', async () => {
    const response = await find(randomUUID());

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('should answer 400 for a malformed key', async () => {
    expect((await find('abc')).status).toBe(400);
  });
});
