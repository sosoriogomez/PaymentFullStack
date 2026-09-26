export const CARD_BRANDS = ['VISA', 'MASTERCARD', 'UNKNOWN'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];
export type SupportedBrand = Exclude<CardBrand, 'UNKNOWN'>;

export const MAX_CARD_DIGITS = 19;
const CARD_GROUP_SIZE = 4;

interface BrandRule {
  readonly brand: SupportedBrand;
  readonly prefix: RegExp;
  readonly lengths: readonly number[];
}

/** VISA: starts with 4. Mastercard: 51–55 or the 2221–2720 range (16 digits). */
const BRAND_RULES = [
  { brand: 'VISA', prefix: /^4/, lengths: [13, 16, 19] },
  {
    brand: 'MASTERCARD',
    prefix: /^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/,
    lengths: [16],
  },
] as const satisfies readonly BrandRule[];

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** Mod 10 checksum of card numbers (12 to 19 digits). */
export const luhnCheck = (digits: string): boolean => {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
};

const ruleFor = (digits: string) => BRAND_RULES.find((rule) => rule.prefix.test(digits));

export const detectBrand = (digits: string): CardBrand => ruleFor(digits)?.brand ?? 'UNKNOWN';

export type CardNumberProblem = 'EMPTY' | 'UNSUPPORTED_BRAND' | 'INVALID';

/** Why a card number cannot be used, or null when it can (supported brand, length and Luhn). */
export const cardNumberProblem = (value: string): CardNumberProblem | null => {
  const digits = onlyDigits(value);
  if (digits.length === 0) return 'EMPTY';
  const rule = ruleFor(digits);
  if (!rule) return 'UNSUPPORTED_BRAND';
  return (rule.lengths as readonly number[]).includes(digits.length) && luhnCheck(digits)
    ? null
    : 'INVALID';
};

/** `4242424242424242` → `4242 4242 4242 4242` (at most 19 digits). */
export const formatCardNumber = (value: string): string =>
  onlyDigits(value)
    .slice(0, MAX_CARD_DIGITS)
    .replace(new RegExp(`(\\d{${CARD_GROUP_SIZE}})(?=\\d)`, 'g'), '$1 ');

/**
 * Where the caret goes after reformatting, so editing in the middle of the number does not jump
 * to the end: right after the same count of digits it had before.
 */
export const caretAfterDigits = (formatted: string, digitsBeforeCaret: number): number => {
  if (digitsBeforeCaret <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted.charAt(index))) seen += 1;
    if (seen === digitsBeforeCaret) return index + 1;
  }
  return formatted.length;
};

export const lastFourOf = (value: string): string => onlyDigits(value).slice(-4);
