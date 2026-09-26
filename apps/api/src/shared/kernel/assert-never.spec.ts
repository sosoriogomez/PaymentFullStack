import { assertNever } from './assert-never';

describe('assertNever', () => {
  it('should throw with the unexpected value', () => {
    expect(() => assertNever('surprise' as never)).toThrow('Unexpected value: "surprise"');
  });
});
