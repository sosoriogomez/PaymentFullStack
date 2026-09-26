import { type z } from 'zod';
import { err, ok, type Result } from '../lib/result';
import { INVALID_RESPONSE, NETWORK_ERROR, TIMEOUT_ERROR, type ApiError } from './ports';

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 10_000;

export interface RawRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

const isTimeout = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');

export const apiError = (
  code: string,
  status: number | null = null,
  detail: string | null = null,
): ApiError => ({
  code,
  status,
  detail,
});

/** fetch with a timeout; network failures and timeouts become errors instead of exceptions. */
export async function sendRequest(
  fetchFn: FetchFn,
  request: RawRequest,
): Promise<Result<Response, ApiError>> {
  try {
    const response = await fetchFn(request.url, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...request.headers,
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    return ok(response);
  } catch (error) {
    return err(apiError(isTimeout(error) ? TIMEOUT_ERROR : NETWORK_ERROR));
  }
}

/** Parses a JSON body and validates it; anything unexpected is INVALID_RESPONSE. */
export async function readJson<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<Result<T, ApiError>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err(apiError(INVALID_RESPONSE, response.status));
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? ok(parsed.data) : err(apiError(INVALID_RESPONSE, response.status));
}
