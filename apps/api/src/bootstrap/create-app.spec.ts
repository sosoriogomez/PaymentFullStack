import request from 'supertest';
import { testEnv } from '../../test/support/test-env';
import { createApp } from './create-app';

describe('createApp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ...testEnv() };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should build the application with the global prefix and URI versioning', async () => {
    const app = await createApp();
    app.useLogger(false);
    await app.init();

    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    await app.close();
  });

  it('should fail fast when the environment is invalid', async () => {
    process.env = { ...originalEnv, ...testEnv({ PG_PRIVATE_KEY: undefined }) };

    await expect(createApp()).rejects.toThrow(/PG_PRIVATE_KEY/);
  });
});
