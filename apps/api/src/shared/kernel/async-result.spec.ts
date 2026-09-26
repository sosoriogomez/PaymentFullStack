import { AsyncResult } from './async-result';
import { err, ok, type Result } from './result';

describe('AsyncResult', () => {
  it('should be awaitable and resolve to the underlying result', async () => {
    await expect(AsyncResult.ok(1)).resolves.toEqual(ok(1));
    await expect(AsyncResult.err('boom')).resolves.toEqual(err('boom'));
  });

  it('should accept a promise of a result', async () => {
    await expect(AsyncResult.from(Promise.resolve(ok('x')))).resolves.toEqual(ok('x'));
  });

  it('should map sync and async functions on the ok track', async () => {
    const result = await AsyncResult.ok(2)
      .map((n) => n * 3)
      .map((n) => Promise.resolve(n + 1));

    expect(result).toEqual(ok(7));
  });

  it('should chain steps that return results, promises of results or other AsyncResults', async () => {
    const result = await AsyncResult.ok<number, string>(1)
      .andThen((n) => ok(n + 1))
      .andThen((n) => Promise.resolve(ok(n * 10)))
      .andThen((n) => AsyncResult.ok(`${n}!`));

    expect(result).toEqual(ok('20!'));
  });

  it('should switch to the error track and skip every later step', async () => {
    const later = jest.fn((n: number): Result<number, string> => ok(n));
    const mapper = jest.fn((n: number) => n);
    const effect = jest.fn();

    const result = await AsyncResult.ok<number, string>(1)
      .andThen((): Result<number, string> => err('stop'))
      .andThen(later)
      .map(mapper)
      .tap(effect);

    expect(result).toEqual(err('stop'));
    expect(later).not.toHaveBeenCalled();
    expect(mapper).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
  });

  it('should transform only errors with mapErr', async () => {
    await expect(AsyncResult.err('boom').mapErr((e) => ({ reason: e }))).resolves.toEqual(
      err({ reason: 'boom' }),
    );
    await expect(AsyncResult.ok(1).mapErr(() => 'never')).resolves.toEqual(ok(1));
  });

  it('should run side effects with tap and keep the value', async () => {
    const seen: number[] = [];

    const result = await AsyncResult.ok(5).tap(async (n) => {
      await Promise.resolve();
      seen.push(n);
    });

    expect(result).toEqual(ok(5));
    expect(seen).toEqual([5]);
  });

  it('should fold both tracks with match', async () => {
    await expect(
      AsyncResult.ok(1).match(
        (v) => `ok:${v}`,
        (e) => `err:${String(e)}`,
      ),
    ).resolves.toBe('ok:1');
    await expect(
      AsyncResult.err('x').match(
        (v) => `ok:${String(v)}`,
        (e) => `err:${e}`,
      ),
    ).resolves.toBe('err:x');
  });

  it('should propagate unexpected rejections instead of hiding them', async () => {
    const failing = AsyncResult.ok(1).map(() => {
      throw new Error('bug');
    });

    await expect(failing).rejects.toThrow('bug');
  });
});
