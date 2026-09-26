import { PAYMENT_GATEWAY } from '../../src/modules/payment-gateway/domain/payment-gateway.port';
import { FAKE_ACCEPTANCE, FakePaymentGateway } from '../fakes/fake-payment-gateway';
import { createTestApp, type TestApp } from '../support/test-app';

describe('GET /api/v1/checkout/acceptance', () => {
  let testApp: TestApp;
  const gateway = new FakePaymentGateway();

  beforeAll(async () => {
    testApp = await createTestApp({
      customize: (builder) => builder.overrideProvider(PAYMENT_GATEWAY).useValue(gateway),
    });
  });

  afterEach(() => gateway.recover());

  afterAll(async () => {
    await testApp.close();
  });

  const acceptance = () => testApp.api().get('/api/v1/checkout/acceptance');

  it('should return the tokens and permalinks the customer must accept', async () => {
    const response = await acceptance();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(FAKE_ACCEPTANCE);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('should answer 503 with Retry-After when the gateway is unavailable', async () => {
    gateway.failOn('acceptance', { code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' });

    const response = await acceptance();

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.body).toMatchObject({ code: 'GATEWAY_UNAVAILABLE', status: 503 });
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('should answer 502 without leaking the reason when the gateway rejects the request', async () => {
    gateway.failOn('acceptance', { code: 'GATEWAY_REJECTED', reason: 'INVALID_PUBLIC_KEY' });

    const response = await acceptance();

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('GATEWAY_REJECTED');
    expect(JSON.stringify(response.body)).not.toContain('INVALID_PUBLIC_KEY');
  });
});
