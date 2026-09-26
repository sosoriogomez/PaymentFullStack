import {
  caretAfterDigits,
  cardNumberProblem,
  detectBrand,
  formatCardNumber,
  lastFourOf,
  luhnCheck,
  onlyDigits,
  toCardBrand,
} from './card-number';

describe('luhnCheck', () => {
  it.each([
    ['4242424242424242', true],
    ['4111111111111111', true],
    ['5555555555554444', true],
    ['4000000000006', true],
    ['4000000000000000006', true],
    ['4242424242424241', false],
    ['12345678901', false],
    ['12345678901234567890', false],
    ['4242 4242 4242 4242', false],
  ])('%s → %s', (digits, valid) => {
    expect(luhnCheck(digits)).toBe(valid);
  });
});

describe('detectBrand', () => {
  it.each([
    ['4', 'VISA'],
    ['4242424242424242', 'VISA'],
    ['51', 'MASTERCARD'],
    ['55', 'MASTERCARD'],
    ['5555555555554444', 'MASTERCARD'],
    ['2221', 'MASTERCARD'],
    ['2299', 'MASTERCARD'],
    ['2300', 'MASTERCARD'],
    ['2699', 'MASTERCARD'],
    ['2710', 'MASTERCARD'],
    ['2720', 'MASTERCARD'],
    ['2220', 'UNKNOWN'],
    ['2721', 'UNKNOWN'],
    ['50', 'UNKNOWN'],
    ['56', 'UNKNOWN'],
    ['378282246310005', 'UNKNOWN'],
    ['', 'UNKNOWN'],
  ])('%p → %s', (digits, brand) => {
    expect(detectBrand(digits)).toBe(brand);
  });
});

describe('cardNumberProblem', () => {
  it.each([
    ['4242 4242 4242 4242', null],
    ['4000000000006', null],
    ['4000000000000000006', null],
    ['5105 1051 0510 5100', null],
    ['2221 0000 0000 0009', null],
    ['2720 9900 0000 0007', null],
    ['', 'EMPTY'],
    ['   ', 'EMPTY'],
    ['3782 822463 10005', 'UNSUPPORTED_BRAND'],
    ['6011 1111 1111 1117', 'UNSUPPORTED_BRAND'],
    ['4242 4242 4242 4241', 'INVALID'],
    ['4242 4242 4242', 'INVALID'],
    ['5555 5555 5555 4444 0', 'INVALID'],
  ])('%p → %p', (value, problem) => {
    expect(cardNumberProblem(value)).toBe(problem);
  });
});

describe('formatCardNumber', () => {
  it.each([
    ['4242424242424242', '4242 4242 4242 4242'],
    ['4242 42a4-2424', '4242 4242 424'],
    ['4242', '4242'],
    ['42424', '4242 4'],
    ['40000000000000000061234', '4000 0000 0000 0000 006'],
    ['', ''],
  ])('%p → %p', (value, formatted) => {
    expect(formatCardNumber(value)).toBe(formatted);
  });
});

describe('caretAfterDigits', () => {
  it.each([
    ['4242 4242', 0, 0],
    ['4242 4242', 3, 3],
    ['4242 4242', 4, 4],
    ['4242 4242', 5, 6],
    ['4242 4242', 8, 9],
    ['4242 4242', 12, 9],
  ])('in %p after %i digits → %i', (formatted, digits, caret) => {
    expect(caretAfterDigits(formatted, digits)).toBe(caret);
  });
});

it('should keep digits and the last four', () => {
  expect(onlyDigits('4242-4242 x')).toBe('42424242');
  expect(lastFourOf('4242 4242 4242 4242')).toBe('4242');
});

it.each([
  ['VISA', 'VISA'],
  ['visa', 'VISA'],
  ['MASTERCARD', 'MASTERCARD'],
  ['AMEX', 'UNKNOWN'],
])('should map the gateway brand %s to %s', (name, brand) => {
  expect(toCardBrand(name)).toBe(brand);
});
