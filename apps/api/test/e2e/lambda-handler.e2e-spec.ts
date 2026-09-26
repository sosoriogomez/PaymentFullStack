import { seedProducts } from '../../src/database/seeds/products.seed';
import { createDataSource } from '../../src/database/data-source-options';
import { createTestDatabase, type TestDatabase } from '../support/database/test-database';
import { databaseSettings } from '../support/database/settings';
import { apiGatewayEvent, lambdaContext } from '../support/api-gateway-event';
import { testEnv } from '../support/test-env';

interface LambdaResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

describe('Lambda HTTP handler (API Gateway v2 → NestJS)', () => {
  const originalEnv = process.env;
  let database: TestDatabase;
  let handler: (event: unknown, context: never) => Promise<unknown>;

  beforeAll(async () => {
    database = await createTestDatabase();
    const dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
    await dataSource.destroy();
    process.env = { ...originalEnv, ...testEnv({ DATABASE_URL: database.url }) };
    ({ handler } = await import('../../src/lambda'));
  });

  afterAll(async () => {
    process.env = originalEnv;
    await database.drop();
  });

  const invoke = async (method: string, path: string) =>
    (await handler(apiGatewayEvent(method, path), lambdaContext)) as LambdaResponse;

  it('should answer the health check through the proxy', async () => {
    const response = await invoke('GET', '/api/v1/health');

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok', database: 'up' });
  });

  it('should reuse the same app on later invocations and pass query strings', async () => {
    const response = await invoke('GET', '/api/v1/products?limit=2');

    expect(response.statusCode).toBe(200);
    expect((JSON.parse(response.body) as { items: unknown[] }).items).toHaveLength(2);
  });

  it('should return problem details for errors', async () => {
    const response = await invoke('GET', '/api/v1/products/abc');

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
  });
});

describe('Lambda HTTP handler cold start failure', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should fail the invocation and retry the bootstrap on the next one', async () => {
    process.env = { ...originalEnv, ...testEnv({ PG_PRIVATE_KEY: undefined }) };
    await jest.isolateModulesAsync(async () => {
      const { handler } = await import('../../src/lambda');

      await expect(
        handler(apiGatewayEvent('GET', '/api/v1/health'), lambdaContext),
      ).rejects.toThrow(/PG_PRIVATE_KEY/);
      await expect(
        handler(apiGatewayEvent('GET', '/api/v1/health'), lambdaContext),
      ).rejects.toThrow(/PG_PRIVATE_KEY/);
    });
  });
});
