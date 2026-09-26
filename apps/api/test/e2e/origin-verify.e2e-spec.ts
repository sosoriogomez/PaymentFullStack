import { createTestApp, type TestApp } from '../support/test-app';

const SECRET = 'cdn-shared-secret-0123456789';

describe('Origin verification (only CloudFront may call the API on AWS)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ env: { APP_ENV: 'aws', ORIGIN_VERIFY_SECRET: SECRET } });
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('should reject direct calls without the header', async () => {
    const response = await testApp.api().get('/api/v1/health');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      detail: 'Requests must come through the CDN',
    });
  });

  it('should reject a wrong header value', async () => {
    const response = await testApp.api().get('/api/v1/health').set('X-Origin-Verify', 'guess');

    expect(response.status).toBe(403);
  });

  it('should accept requests carrying the CloudFront secret', async () => {
    const response = await testApp.api().get('/api/v1/health').set('X-Origin-Verify', SECRET);

    expect(response.status).toBe(200);
  });
});

describe('Origin verification misconfiguration', () => {
  it('should refuse to start on AWS without the secret', async () => {
    await expect(createTestApp({ env: { APP_ENV: 'aws' } })).rejects.toThrow(
      'ORIGIN_VERIFY_SECRET is required to serve HTTP on AWS',
    );
  });
});
