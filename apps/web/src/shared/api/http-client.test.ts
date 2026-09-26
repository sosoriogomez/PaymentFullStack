/** @jest-environment node */
import { fakeFetch, jsonResponse, lastCall, problemResponse } from '@test/support/fake-fetch';
import { z } from 'zod';
import { err } from '../lib/result';
import { HttpClient } from './http-client';

const schema = z.object({ name: z.string() });
const get = { method: 'GET' as const, path: '/things', schema };

describe('HttpClient', () => {
  it('should return the validated body, status and headers on success', async () => {
    const fetchFn = fakeFetch(jsonResponse(200, { name: 'thing' }, { 'x-extra': 'yes' }));

    const result = await new HttpClient('/api/v1', fetchFn).send(get);

    expect(result.ok && result.value.data).toEqual({ name: 'thing' });
    expect(result.ok && result.value.status).toBe(200);
    expect(result.ok && result.value.headers.get('x-extra')).toBe('yes');
    expect(lastCall(fetchFn).url).toBe('/api/v1/things');
  });

  it('should send JSON bodies, custom headers and query strings', async () => {
    const fetchFn = fakeFetch(jsonResponse(201, { name: 'created' }));

    await new HttpClient('/api/v1', fetchFn).send({
      method: 'POST',
      path: '/things',
      query: { a: 'x y', b: 2 },
      body: { name: 'new' },
      headers: { 'Idempotency-Key': 'k-1' },
      schema,
    });

    const call = lastCall(fetchFn);
    expect(call.url).toBe('/api/v1/things?a=x+y&b=2');
    expect(call.init.method).toBe('POST');
    expect(call.body).toEqual({ name: 'new' });
    expect(call.init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': 'k-1',
    });
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('should translate problem details into an ApiError', async () => {
    const result = await new HttpClient(
      '',
      fakeFetch(problemResponse(409, 'INSUFFICIENT_STOCK')),
    ).send(get);

    expect(result).toEqual(
      err({ code: 'INSUFFICIENT_STOCK', status: 409, detail: 'detail of INSUFFICIENT_STOCK' }),
    );
  });

  it('should fall back to HTTP_<status> for errors without problem details', async () => {
    const html = new Response('<h1>Bad gateway</h1>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    });
    const brokenJson = new Response('{oops', {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
    const otherJson = jsonResponse(400, { message: 'no code here' });

    const client = new HttpClient('', fakeFetch(html, brokenJson, otherJson));

    expect(await client.send(get)).toEqual(err({ code: 'HTTP_502', status: 502, detail: null }));
    expect(await client.send(get)).toEqual(err({ code: 'HTTP_500', status: 500, detail: null }));
    expect(await client.send(get)).toEqual(err({ code: 'HTTP_400', status: 400, detail: null }));
  });

  it('should reject success bodies that are not JSON or break the contract', async () => {
    const notJson = new Response('plain', { status: 200 });
    const wrongShape = jsonResponse(200, { name: 42 });
    const client = new HttpClient('', fakeFetch(notJson, wrongShape));

    expect(await client.send(get)).toEqual(
      err({ code: 'INVALID_RESPONSE', status: 200, detail: null }),
    );
    expect(await client.send(get)).toEqual(
      err({ code: 'INVALID_RESPONSE', status: 200, detail: null }),
    );
  });

  it('should map network failures and timeouts', async () => {
    const client = new HttpClient(
      '',
      fakeFetch(
        new TypeError('Failed to fetch'),
        new DOMException('The operation timed out', 'TimeoutError'),
      ),
    );

    expect(await client.send(get)).toEqual(
      err({ code: 'NETWORK_ERROR', status: null, detail: null }),
    );
    expect(await client.send(get)).toEqual(err({ code: 'TIMEOUT', status: null, detail: null }));
  });
});
