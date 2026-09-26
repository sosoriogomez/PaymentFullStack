import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ProbeController } from '../support/probe.controller';
import { createTestApp } from '../support/test-app';

const UUID = /^[0-9a-f-]{36}$/;

describe('Problem Details (RFC 9457) and request ids', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('should hide unexpected errors behind a 500 problem without internals', async () => {
    const response = await api().get('/api/v1/__probe/boom');

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: 'An unexpected error occurred',
      instance: '/api/v1/__probe/boom',
      requestId: expect.stringMatching(UUID),
    });
    expect(JSON.stringify(response.body)).not.toMatch(/hunter2|stack/);
  });

  it('should map domain errors with their code and extensions', async () => {
    const response = await api().get('/api/v1/__probe/stock');

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      title: 'Conflict',
      code: 'INSUFFICIENT_STOCK',
      detail: 'Only 2 units available',
      available: 2,
      requested: 5,
    });
  });

  it('should add Retry-After when the gateway is unavailable', async () => {
    const response = await api().get('/api/v1/__probe/gateway');

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.body.code).toBe('GATEWAY_UNAVAILABLE');
  });

  it('should reject unknown properties with the name of the field', async () => {
    const response = await api()
      .post('/api/v1/__probe/echo')
      .send({ name: 'Ana', quantity: 1, address: { city: 'Cali' }, isAdmin: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'isAdmin', message: 'property isAdmin should not exist' }],
    });
  });

  it('should report nested validation errors with their path', async () => {
    const response = await api()
      .post('/api/v1/__probe/echo')
      .send({ name: 'An', quantity: 0, address: { city: 'X' } });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
        expect.objectContaining({ field: 'quantity' }),
        expect.objectContaining({ field: 'address.city' }),
      ]),
    );
  });

  it('should accept a valid body', async () => {
    const body = { name: 'Ana', quantity: 2, address: { city: 'Cali' } };

    const response = await api().post('/api/v1/__probe/echo').send(body);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(body);
  });

  it('should turn malformed JSON into a 400 problem', async () => {
    const response = await api()
      .post('/api/v1/__probe/echo')
      .set('content-type', 'application/json')
      .send('{"name":');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  it('should map framework 4xx exceptions and unknown routes', async () => {
    const teapot = await api().get('/api/v1/__probe/teapot');
    const missing = await api().get('/api/v1/nothing-here');

    expect(teapot.status).toBe(418);
    expect(teapot.body.code).toBe('I_M_A_TEAPOT');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND', instance: '/api/v1/nothing-here' });
  });

  it('should not expose the message of framework 5xx exceptions', async () => {
    const response = await api().get('/api/v1/__probe/bad-gateway-exception');

    expect(response.status).toBe(500);
    expect(response.body.detail).toBe('An unexpected error occurred');
  });

  it('should reuse a valid incoming request id and echo it', async () => {
    const requestId = '0f8c5a1e-2b3c-4d5e-8f90-123456789abc';

    const response = await api().get('/api/v1/__probe/stock').set('x-request-id', requestId);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body.requestId).toBe(requestId);
  });

  it('should replace an invalid incoming request id', async () => {
    const response = await api().get('/api/v1/health').set('x-request-id', 'not-a-uuid<script>');

    expect(response.headers['x-request-id']).toMatch(UUID);
  });
});
