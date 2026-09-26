import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FetchFn } from '../../src/modules/payment-gateway/infrastructure/http-payment-gateway.adapter';

export const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'pg', `${name}.json`), 'utf8'));

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export type FakeAnswer = Response | Error | 'hang';

/**
 * fetch double: answers in order; 'hang' never answers until the request is aborted (timeouts).
 * Records every call.
 */
export function fakeGatewayFetch(...answers: FakeAnswer[]): jest.MockedFunction<FetchFn> {
  const queue = [...answers];
  return jest.fn((_url: string, init: RequestInit) => {
    const next = queue.shift();
    if (next === undefined) return Promise.reject(new Error('fakeGatewayFetch: no more answers'));
    if (next === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });
    }
    return next instanceof Response ? Promise.resolve(next) : Promise.reject(next);
  });
}
