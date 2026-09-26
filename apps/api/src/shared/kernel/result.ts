/**
 * Railway Oriented Programming primitives. A `Result` is a plain value (no methods), so it can
 * cross layers and be serialized; composition happens with the helpers below or `AsyncResult`.
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const map = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  result.ok ? ok(fn(result.value)) : result;

export const andThen = <T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> => (result.ok ? fn(result.value) : result);

export const mapErr = <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
  result.ok ? result : err(fn(result.error));

/** All ok → ok with every value (same order); otherwise the first error. */
export function combine<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

type OkValues<R> = { -readonly [K in keyof R]: R[K] extends Result<infer T, unknown> ? T : never };
type ErrorOf<R> = R extends Err<infer E> ? E : never;

/** Record version of `combine`: all ok → ok with the same keys; otherwise the first error. */
export function combineObject<R extends Readonly<Record<string, Result<unknown, unknown>>>>(
  results: R,
): Result<OkValues<R>, ErrorOf<R[keyof R]>> {
  const values: Record<string, unknown> = {};
  for (const [key, result] of Object.entries(results)) {
    if (!result.ok) return result as Err<ErrorOf<R[keyof R]>>;
    values[key] = result.value;
  }
  return ok(values as OkValues<R>);
}

export const fromPredicate = <T, E>(
  value: T,
  predicate: (value: T) => boolean,
  onFalse: (value: T) => E,
): Result<T, E> => (predicate(value) ? ok(value) : err(onFalse(value)));
