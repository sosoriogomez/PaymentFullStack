import { randomUUID } from 'node:crypto';
import { seedProducts } from '../../src/database/seeds/products.seed';
import { createTestApp, type TestApp } from '../support/test-app';

const SECRET = 'cdn-shared-secret-0123456789';
const ALLOWED_ORIGIN = 'https://shop.example.com';

describe('Security headers, CORS and body limits (OWASP API8, API4)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ env: { CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN } });
    await seedProducts(testApp.dataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('should send strict security headers on every response', async () => {
    const response = await testApp.api().get('/api/v1/products');

    expect(response.headers).toMatchObject({
      'content-security-policy': "default-src 'none';frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'cross-origin-resource-policy': 'same-origin',
      'cache-control': 'no-store',
    });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should keep the headers on error responses', async () => {
    const response = await testApp.api().get('/api/v1/products/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should allow CORS only for the configured origins', async () => {
    const allowed = await testApp.api().get('/api/v1/products').set('Origin', ALLOWED_ORIGIN);
    const other = await testApp.api().get('/api/v1/products').set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(allowed.headers['access-control-expose-headers']).toContain('Idempotent-Replayed');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should let the allowed origin send the Idempotency-Key header', async () => {
    const preflight = await testApp
      .api()
      .options('/api/v1/transactions')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,idempotency-key');

    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toContain('Idempotency-Key');
  });

  it('should reject bodies over 16 KB with 413', async () => {
    const response = await testApp
      .api()
      .post('/api/v1/customers')
      .send({ fullName: 'x'.repeat(17 * 1024), email: 'ana@mail.com', phone: '3001234567' });

    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('should accept up to 32 KB on the gateway events route only', async () => {
    const response = await testApp
      .api()
      .post('/api/v1/payment-events')
      .send({ event: 'transaction.updated', padding: 'x'.repeat(20 * 1024) });

    expect(response.status).toBe(400); // parsed and validated, not rejected for its size
  });
});

describe('Rate limiting per client IP (OWASP API4, API6, I-01)', () => {
  let testApp: TestApp;
  const viewer = (ip: string) => ({
    'X-Origin-Verify': SECRET,
    'CloudFront-Viewer-Address': `${ip}:443`,
  });

  beforeAll(async () => {
    testApp = await createTestApp({
      env: {
        APP_ENV: 'aws',
        ORIGIN_VERIFY_SECRET: SECRET,
        RATE_LIMIT_PER_MINUTE: '3',
        PAYMENT_RATE_LIMIT_PER_MINUTE: '2',
      },
    });
    await seedProducts(testApp.dataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  const listProducts = (ip: string) => testApp.api().get('/api/v1/products').set(viewer(ip));

  it('should answer 429 with Retry-After once a client exceeds the limit', async () => {
    const statuses = [];
    for (let request = 0; request < 4; request += 1) {
      statuses.push((await listProducts('198.51.100.1')).status);
    }
    const limited = await listProducts('198.51.100.1');

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(limited.body).toMatchObject({ status: 429, code: 'TOO_MANY_REQUESTS' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('should count each viewer address on its own (the CloudFront edge IP is the same)', async () => {
    expect((await listProducts('198.51.100.2')).status).toBe(200);
    expect((await listProducts('2001:db8::7')).status).toBe(200);
  });

  it('should allow fewer payment attempts than reads', async () => {
    const pay = () =>
      testApp
        .api()
        .post('/api/v1/transactions')
        .set(viewer('203.0.113.9'))
        .set('Idempotency-Key', randomUUID())
        .send({});
    const statuses = [(await pay()).status, (await pay()).status, (await pay()).status];

    expect(statuses).toEqual([400, 400, 429]);
  });

  it('should never limit the gateway webhook', async () => {
    const statuses = [];
    for (let request = 0; request < 6; request += 1) {
      statuses.push(
        (await testApp.api().post('/api/v1/payment-events').set(viewer('192.0.2.1')).send({}))
          .status,
      );
    }

    expect(statuses.every((status) => status === 400)).toBe(true);
  });
});
