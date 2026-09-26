import { type FetchFn } from '@/shared/api/http';

export const jsonResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export const problemResponse = (
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Response =>
  new Response(
    JSON.stringify({ type: 'about:blank', status, code, detail: `detail of ${code}`, ...extra }),
    {
      status,
      headers: { 'content-type': 'application/problem+json' },
    },
  );

/** A fetch double that answers with the given responses (or rejects with errors) in order. */
export function fakeFetch(
  ...responses: (Response | Error | DOMException)[]
): jest.MockedFunction<FetchFn> {
  const queue = [...responses];
  return jest.fn((_input: string, _init: RequestInit) => {
    const next = queue.shift();
    if (!next) return Promise.reject(new Error('fakeFetch: no more responses'));
    return next instanceof Response ? Promise.resolve(next) : Promise.reject(next);
  });
}

export const lastCall = (fetchFn: jest.MockedFunction<FetchFn>) => {
  const call = fetchFn.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  const [url, init] = call;
  return {
    url,
    init,
    body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  };
};
