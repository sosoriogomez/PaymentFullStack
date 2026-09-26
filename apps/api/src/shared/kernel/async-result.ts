import { err, ok, type Result } from './result';

/**
 * Asynchronous railway: each step runs only while the previous one succeeded. The first error
 * "switches the track" and every later step is skipped. It is awaitable (`PromiseLike`).
 */
export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
  private constructor(private readonly promise: Promise<Result<T, E>>) {}

  static from<T, E>(source: Result<T, E> | PromiseLike<Result<T, E>>): AsyncResult<T, E> {
    return new AsyncResult(Promise.resolve(source));
  }

  static ok<T, E = never>(value: T): AsyncResult<T, E> {
    return AsyncResult.from<T, E>(ok(value));
  }

  static err<E, T = never>(error: E): AsyncResult<T, E> {
    return AsyncResult.from<T, E>(err(error));
  }

  map<U>(fn: (value: T) => U | PromiseLike<U>): AsyncResult<U, E> {
    return new AsyncResult(this.promise.then(async (r) => (r.ok ? ok(await fn(r.value)) : r)));
  }

  andThen<U, F>(fn: (value: T) => Result<U, F> | PromiseLike<Result<U, F>>): AsyncResult<U, E | F> {
    return new AsyncResult<U, E | F>(this.promise.then((r) => (r.ok ? fn(r.value) : r)));
  }

  mapErr<F>(fn: (error: E) => F): AsyncResult<T, F> {
    return new AsyncResult(this.promise.then((r) => (r.ok ? r : err(fn(r.error)))));
  }

  /** Runs a side effect with the value and keeps it on the track. */
  tap(fn: (value: T) => void | PromiseLike<void>): AsyncResult<T, E> {
    return this.map(async (value) => {
      await fn(value);
      return value;
    });
  }

  match<R>(onOk: (value: T) => R, onErr: (error: E) => R): Promise<R> {
    return this.promise.then((r) => (r.ok ? onOk(r.value) : onErr(r.error)));
  }

  then<A = Result<T, E>, B = never>(
    onfulfilled?: ((value: Result<T, E>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.promise.then(onfulfilled, onrejected);
  }
}
