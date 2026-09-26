import {
  formatExpiry,
  isCvcValid,
  isExpiryValid,
  isHolderNameValid,
  parseExpiry,
} from './card-details';

const NOW = new Date(2026, 9, 15, 12, 0, 0).getTime(); // 15 Oct 2026, local time

describe('formatExpiry', () => {
  it.each([
    ['1', '1'],
    ['12', '12'],
    ['122', '12/2'],
    ['1229', '12/29'],
    ['12/29', '12/29'],
    ['12/295', '12/29'],
    ['ab', ''],
  ])('%p → %p', (value, formatted) => {
    expect(formatExpiry(value)).toBe(formatted);
  });
});

describe('parseExpiry', () => {
  it('should read month and four-digit year', () => {
    expect(parseExpiry('08/29')).toEqual({ month: 8, year: 2029 });
  });

  it.each(['', '8/29', '08/2', '0829', '08-29'])('should reject %p', (value) => {
    expect(parseExpiry(value)).toBeNull();
  });
});

describe('isExpiryValid', () => {
  it.each([
    [{ month: 10, year: 2026 }, true],
    [{ month: 11, year: 2026 }, true],
    [{ month: 1, year: 2046 }, true],
    [{ month: 12, year: 2046 }, true],
    [{ month: 9, year: 2026 }, false],
    [{ month: 12, year: 2025 }, false],
    [{ month: 1, year: 2047 }, false],
    [{ month: 0, year: 2030 }, false],
    [{ month: 13, year: 2030 }, false],
  ])('%p → %s', (expiry, valid) => {
    expect(isExpiryValid(expiry, NOW)).toBe(valid);
  });
});

describe('isCvcValid', () => {
  it.each([
    ['123', true],
    ['000', true],
    ['12', false],
    ['1234', false],
    ['12a', false],
  ])('%p → %s', (value, valid) => {
    expect(isCvcValid(value)).toBe(valid);
  });
});

describe('isHolderNameValid', () => {
  it.each([
    ['Ana Pérez', true],
    ['JOSÉ MUÑOZ', true],
    ["María O'Neil", true],
    ['  Ana   Pérez  ', true],
    ['Ana', false],
    ['A'.repeat(41), false],
    ['Ana P3rez', false],
    ['-Ana Pérez', false],
  ])('%p → %s', (value, valid) => {
    expect(isHolderNameValid(value)).toBe(valid);
  });
});
