import { type z } from 'zod';
import { AsyncResult, err, ok, type Result } from '../lib/result';
import { problemSchema } from './contracts';
import { apiError, type FetchFn, readJson, sendRequest } from './http';
import { type ApiError } from './ports';

export interface ApiRequest<T> {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number>>;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly schema: z.ZodType<T>;
}

export interface ApiResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly headers: Headers;
}

/** Turns an error response into an ApiError, reading application/problem+json when present. */
async function problemOf(response: Response): Promise<ApiError> {
  const fallback = apiError(`HTTP_${response.status}`, response.status);
  if (!(response.headers.get('content-type') ?? '').includes('json')) return fallback;
  try {
    const parsed = problemSchema.safeParse(await response.json());
    return parsed.success
      ? apiError(parsed.data.code, response.status, parsed.data.detail ?? null)
      : fallback;
  } catch {
    return fallback;
  }
}

const withQuery = (path: string, query?: Readonly<Record<string, string | number>>): string => {
  if (!query) return path;
  const params = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  );
  return `${path}?${params.toString()}`;
};

/** Client of our own API (same origin): JSON in, validated JSON out, errors as problem details. */
export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  async send<T>(request: ApiRequest<T>): Promise<Result<ApiResponse<T>, ApiError>> {
    return await AsyncResult.from(
      sendRequest(this.fetchFn, {
        url: `${this.baseUrl}${withQuery(request.path, request.query)}`,
        method: request.method,
        ...(request.headers ? { headers: request.headers } : {}),
        ...(request.body === undefined ? {} : { body: request.body }),
      }),
    ).andThen(async (response) => {
      if (!response.ok) return err(await problemOf(response));
      const data = await readJson(response, request.schema);
      return data.ok
        ? ok({ data: data.value, status: response.status, headers: response.headers })
        : data;
    });
  }
}
