/** Same Railway Oriented Programming concept as the API: services never throw for expected failures. */
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

/** Asynchronous railway: each step runs only while the previous one succeeded. */
export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
  private constructor(private readonly promise: Promise<Result<T, E>>) {}

  static from<T, E>(source: Result<T, E> | PromiseLike<Result<T, E>>): AsyncResult<T, E> {
    return new AsyncResult(Promise.resolve(source));
  }

  map<U>(fn: (value: T) => U | PromiseLike<U>): AsyncResult<U, E> {
    return new AsyncResult(this.promise.then(async (r) => (r.ok ? ok(await fn(r.value)) : r)));
  }

  andThen<U, F>(fn: (value: T) => Result<U, F> | PromiseLike<Result<U, F>>): AsyncResult<U, E | F> {
    return new AsyncResult<U, E | F>(this.promise.then((r) => (r.ok ? fn(r.value) : r)));
  }

  then<A = Result<T, E>, B = never>(
    onfulfilled?: ((value: Result<T, E>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.promise.then(onfulfilled, onrejected);
  }
}
