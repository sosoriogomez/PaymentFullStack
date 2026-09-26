import { andThen, AsyncResult, err, map, mapErr, ok, type Result } from './result';

describe('Result', () => {
  it('should map and chain only the ok track', () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(map(err('x'), (n: number) => n * 2)).toEqual(err('x'));
    expect(andThen(ok(1), (n) => ok(n + 1))).toEqual(ok(2));
    expect(andThen(err('x'), (n: number) => ok(n + 1))).toEqual(err('x'));
  });

  it('should map only the error track with mapErr', () => {
    expect(mapErr(err('x'), (e) => `${e}!`)).toEqual(err('x!'));
    expect(mapErr(ok(1), (e: string) => `${e}!`)).toEqual(ok(1));
  });
});

describe('AsyncResult', () => {
  it('should chain async steps and stop at the first error', async () => {
    const skipped = jest.fn((n: number): Result<number, string> => ok(n));

    const success = await AsyncResult.from(Promise.resolve(ok(1)))
      .andThen((n) => Promise.resolve(ok(n + 1)))
      .map((n) => n * 10);
    const failure = await AsyncResult.from<number, string>(ok(1))
      .andThen((): Result<number, string> => err('stop'))
      .andThen(skipped)
      .map((n) => n * 10);

    expect(success).toEqual(ok(20));
    expect(failure).toEqual(err('stop'));
    expect(skipped).not.toHaveBeenCalled();
  });
});
