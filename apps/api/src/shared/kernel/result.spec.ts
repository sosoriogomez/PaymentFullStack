import { andThen, combine, err, fromPredicate, map, mapErr, ok, type Result } from './result';

describe('Result helpers', () => {
  const double = (n: number) => n * 2;

  it('should map only the ok track', () => {
    expect(map(ok(2), double)).toEqual(ok(4));
    expect(map(err('boom'), double)).toEqual(err('boom'));
  });

  it('should chain with andThen and skip the step after an error', () => {
    const step = jest.fn((n: number): Result<number, string> => ok(n + 1));

    expect(andThen(ok(1), step)).toEqual(ok(2));
    expect(andThen(err('first'), step)).toEqual(err('first'));
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('should map only the error track with mapErr', () => {
    expect(mapErr(err('boom'), (e) => e.toUpperCase())).toEqual(err('BOOM'));
    expect(mapErr(ok(1), (e: string) => e.toUpperCase())).toEqual(ok(1));
  });

  it('should combine results keeping order or returning the first error', () => {
    expect(combine([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
    expect(combine([ok(1), err('a'), err('b')])).toEqual(err('a'));
    expect(combine([])).toEqual(ok([]));
  });

  it('should build a result from a predicate', () => {
    const positive = (n: number) =>
      fromPredicate(
        n,
        (v) => v > 0,
        (v) => `${v} is not positive`,
      );

    expect(positive(3)).toEqual(ok(3));
    expect(positive(-1)).toEqual(err('-1 is not positive'));
  });
});
