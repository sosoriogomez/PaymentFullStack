import { createTestApp, type TestApp } from '../support/test-app';

interface OpenApiDocument {
  info: { title: string; version: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
}

interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  parameters?: { name: string; in: string; required?: boolean }[];
  responses: Record<string, { content?: Record<string, unknown> }>;
}

describe('OpenAPI documentation (/api/docs)', () => {
  let testApp: TestApp;
  let document: OpenApiDocument;

  beforeAll(async () => {
    testApp = await createTestApp();
    document = (await testApp.api().get('/api/docs-json')).body as OpenApiDocument;
  });

  afterAll(async () => {
    await testApp.close();
  });

  const propertiesOf = (schema: string) =>
    Object.keys(document.components.schemas[schema]?.properties ?? {});
  const responsesOf = (path: string, method: string) =>
    Object.keys(document.paths[path]?.[method]?.responses ?? {});

  it('should document every route of the API', () => {
    expect(document.info).toMatchObject({ title: 'Checkout API', version: '1.0' });
    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/v1/checkout/acceptance',
      '/api/v1/checkout/quote',
      '/api/v1/customers',
      '/api/v1/customers/{id}',
      '/api/v1/deliveries/{id}',
      '/api/v1/health',
      '/api/v1/payment-events',
      '/api/v1/products',
      '/api/v1/products/{id}',
      '/api/v1/products/{id}/stock',
      '/api/v1/transactions',
      '/api/v1/transactions/{id}',
    ]);
    const operations = Object.values(document.paths).flatMap((byMethod) => Object.values(byMethod));
    expect(operations.filter((operation) => !operation.summary)).toEqual([]);
    expect(operations.map((operation) => operation.tags?.length)).toEqual(operations.map(() => 1));
  });

  it('should describe the payment request and response from the DTOs', () => {
    const create = document.paths['/api/v1/transactions']?.post;

    expect(create?.parameters).toContainEqual(
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
    );
    expect(responsesOf('/api/v1/transactions', 'post')).toEqual(
      expect.arrayContaining(['200', '201', '400', '409', '422', '429']),
    );
    expect(propertiesOf('CreateTransactionRequest')).toEqual(
      expect.arrayContaining(['productId', 'quantity', 'customerId', 'delivery', 'payment']),
    );
    expect(propertiesOf('CreateTransactionRequest')).not.toContain('amountInCents');
    expect(propertiesOf('TransactionResponse')).toEqual(
      expect.arrayContaining(['reference', 'status', 'amounts', 'card', 'deliveryId']),
    );
  });

  it('should document errors as problem details (RFC 9457)', () => {
    const quote = document.paths['/api/v1/checkout/quote']?.get;

    expect(quote?.responses['409']?.content).toHaveProperty(['application/problem+json']);
    expect(propertiesOf('ProblemDetails')).toEqual(
      expect.arrayContaining(['type', 'title', 'status', 'code', 'detail', 'instance']),
    );
  });

  it('should serve Swagger UI with a CSP that allows its own assets only', async () => {
    const page = await testApp.api().get('/api/docs/');
    const styles = await testApp.api().get('/api/docs/swagger-ui.css');

    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(styles.status).toBe(200);
  });

  it('should keep the strict API policy outside the docs', async () => {
    const response = await testApp.api().get('/api/v1/health');

    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
  });
});
