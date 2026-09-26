import { randomUUID } from 'node:crypto';
import { PRODUCT_SEEDS, seedProducts } from '../../src/database/seeds/products.seed';
import { PAYMENT_GATEWAY } from '../../src/modules/payment-gateway/domain/payment-gateway.port';
import { DELIVERY, PAYMENT } from '../builders/transaction.builder';
import { FakePaymentGateway } from '../fakes/fake-payment-gateway';
import { signedEvent } from '../support/payment-events';
import { createTestApp, type TestApp } from '../support/test-app';

describe('POST /api/v1/payment-events', () => {
  let testApp: TestApp;
  let customerId: string;
  // The gateway never settles on reads here: only the webhook can finalize.
  const gateway = new FakePaymentGateway().willCharge({ initial: 'PENDING' });
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

  afterAll(async () => {
    await testApp.close();
  });

  const pendingTransaction = async () =>
    (
      await testApp.api().post('/api/v1/transactions').set('Idempotency-Key', randomUUID()).send({
        productId: product.id,
        quantity: 1,
        customerId,
        delivery: DELIVERY,
        payment: PAYMENT,
      })
    ).body as { id: string; reference: string; amounts: { total: number } };
  const eventFor = (
    transaction: { reference: string; amounts: { total: number } },
    status = 'APPROVED',
  ) =>
    signedEvent({
      id: `gw-${transaction.reference}`,
      reference: transaction.reference,
      status,
      amount_in_cents: transaction.amounts.total,
    });
  const send = (payload: object) => testApp.api().post('/api/v1/payment-events').send(payload);
  const available = async () =>
    (await testApp.api().get(`/api/v1/products/${product.id}/stock`)).body.available as number;
  const statusOf = async (id: string) =>
    (await testApp.api().get(`/api/v1/transactions/${id}`)).body as {
      status: string;
      deliveryId: string | null;
    };

  it('should finalize an approved transaction: stock updated and delivery assigned', async () => {
    const transaction = await pendingTransaction();
    const before = await available();

    const response = await send(eventFor(transaction));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(await statusOf(transaction.id)).toMatchObject({
      status: 'APPROVED',
      deliveryId: expect.any(String),
    });
    expect(await available()).toBe(before - 1);
  });

  it('should acknowledge a duplicated event without discounting the stock again', async () => {
    const transaction = await pendingTransaction();
    await send(eventFor(transaction));
    const afterFirst = await available();

    const duplicate = await send(eventFor(transaction));

    expect(duplicate.status).toBe(200);
    expect(await available()).toBe(afterFirst);
  });

  it('should answer 401 and change nothing when the checksum does not match', async () => {
    const transaction = await pendingTransaction();
    const forged = {
      ...eventFor(transaction),
      signature: { ...eventFor(transaction).signature, checksum: 'F'.repeat(64) },
    };

    const response = await send(forged);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('INVALID_EVENT_SIGNATURE');
    expect((await statusOf(transaction.id)).status).toBe('PENDING');
  });

  it('should record a declined payment without touching the stock', async () => {
    const transaction = await pendingTransaction();
    const before = await available();

    await send(eventFor(transaction, 'DECLINED'));

    expect(await statusOf(transaction.id)).toMatchObject({ status: 'DECLINED', deliveryId: null });
    expect(await available()).toBe(before);
  });

  it('should accept the checksum in the X-Event-Checksum header', async () => {
    const transaction = await pendingTransaction();
    const event = eventFor(transaction);

    const response = await testApp
      .api()
      .post('/api/v1/payment-events')
      .set('X-Event-Checksum', event.signature.checksum)
      .send({ ...event, signature: { properties: event.signature.properties } });

    expect(response.status).toBe(200);
    expect((await statusOf(transaction.id)).status).toBe('APPROVED');
  });

  it('should acknowledge other events and reject malformed payloads', async () => {
    const other = signedEvent(
      { id: 'x', reference: 'y', status: 'APPROVED', amount_in_cents: 1 },
      { event: 'payment_link.updated' },
    );

    expect((await send(other)).status).toBe(200);
    expect((await send({ hello: 'world' })).status).toBe(400);
  });
});
