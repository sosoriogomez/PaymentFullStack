import request from 'supertest';
import { createApp } from '../../src/bootstrap/create-app';
import { createTestDatabase, type TestDatabase } from '../support/database/test-database';
import { testEnv } from '../support/test-env';

describe('createApp (production bootstrap)', () => {
  const originalEnv = process.env;
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should build the application from the environment with prefix and versioning', async () => {
    process.env = { ...originalEnv, ...testEnv({ DATABASE_URL: database.url }) };
    const app = await createApp();
    await app.init();

    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    await app.close();
  });

  it('should fail fast when the environment is invalid', async () => {
    process.env = {
      ...originalEnv,
      ...testEnv({ DATABASE_URL: database.url, PG_PRIVATE_KEY: undefined }),
    };

    await expect(createApp()).rejects.toThrow(/PG_PRIVATE_KEY/);
  });
});
