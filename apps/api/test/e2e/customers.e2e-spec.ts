import { createTestApp, type TestApp } from '../support/test-app';

describe('Customers API', () => {
  let testApp: TestApp;
  const body = { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('POST /customers should create a customer with 201, Location and masked data', async () => {
    const response = await testApp.api().post('/api/v1/customers').send(body);

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/customers/${response.body.id}`);
    expect(response.body).toEqual({
      id: expect.any(String),
      fullName: 'Ana Pérez',
      email: 'a***@mail.com',
      phone: '***4567',
    });
  });

  it('POST /customers with the same email in another casing should answer 200 with the same id', async () => {
    const created = await testApp
      .api()
      .post('/api/v1/customers')
      .send({ ...body, email: 'ANA@Mail.com' });

    expect(created.status).toBe(200);
    expect(created.headers.location).toBeUndefined();
    const rows = await testApp.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM customers',
    );
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('GET /customers/:id should never return full contact data', async () => {
    const { body: customer } = await testApp.api().post('/api/v1/customers').send(body);

    const response = await testApp.api().get(`/api/v1/customers/${customer.id}`);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(/ana@mail\.com|3001234567/);
  });

  it('GET /customers/:id should answer 404 for unknown customers', async () => {
    const response = await testApp
      .api()
      .get('/api/v1/customers/00000000-0000-4000-8000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it.each([
    [{ ...body, email: 'not-an-email' }, 'email'],
    [{ ...body, phone: '12345' }, 'phone'],
    [{ ...body, fullName: 'A1' }, 'fullName'],
    [{ ...body, role: 'admin' }, 'role'],
  ])('POST /customers should reject %j', async (payload, field) => {
    const response = await testApp.api().post('/api/v1/customers').send(payload);

    expect(response.status).toBe(400);
    expect((response.body.details as { field: string }[]).map((detail) => detail.field)).toContain(
      field,
    );
  });
});
