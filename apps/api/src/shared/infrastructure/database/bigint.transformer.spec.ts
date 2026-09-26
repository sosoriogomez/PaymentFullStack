import { bigintTransformer } from './bigint.transformer';

describe('bigintTransformer', () => {
  it.each([
    ['0', 0],
    ['16300000', 16_300_000],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('should read %p as the number %p', (raw, expected) => {
    expect(bigintTransformer.from(raw)).toBe(expected);
  });

  it('should keep nulls', () => {
    expect(bigintTransformer.from(null)).toBeNull();
  });

  it.each(['9007199254740993', '12.5', 'abc'])('should refuse the unsafe value %p', (raw) => {
    expect(() => bigintTransformer.from(raw)).toThrow(RangeError);
  });

  it('should write numbers untouched', () => {
    expect(bigintTransformer.to(163_000_00)).toBe(163_000_00);
  });

  it('should add numbers instead of concatenating strings', () => {
    const a = bigintTransformer.from('15000000') ?? 0;
    const b = bigintTransformer.from('300000') ?? 0;

    expect(a + b).toBe(15_300_000);
  });
});
