import { createTestApp, type TestApp } from '../support/test-app';

describe('GET /api/v1/health', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('should report ok when the service and the database are up', async () => {
    const response = await testApp.api().get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('should respond 404 for unversioned routes', async () => {
    const response = await testApp.api().get('/health');

    expect(response.status).toBe(404);
  });

  it('should respond 503 when the database is not reachable', async () => {
    const query = jest
      .spyOn(testApp.dataSource, 'query')
      .mockRejectedValueOnce(new Error('connection refused'));

    const response = await testApp.api().get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'An unexpected error occurred',
    });
    query.mockRestore();
  });
});
