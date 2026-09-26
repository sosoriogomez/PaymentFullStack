import { onlyDigits } from './card-number';

/** A card is accepted until 20 years ahead: anything further is a typo. */
export const MAX_EXPIRY_YEARS_AHEAD = 20;
const HOLDER_NAME = /^\p{L}[\p{L} .'-]*$/u;
export const HOLDER_NAME_LENGTH = { min: 5, max: 40 } as const;

export interface Expiry {
  readonly month: number;
  /** Four digits, e.g. 2029. */
  readonly year: number;
}

/** `1229` → `12/29`: the slash appears as soon as the month is complete. */
export const formatExpiry = (value: string): string => {
  const digits = onlyDigits(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

/** `MM/AA` → month and four-digit year; null when incomplete. */
export const parseExpiry = (value: string): Expiry | null => {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return { month: Number(match[1]), year: 2000 + Number(match[2]) };
};

/** Valid month, not expired (usable until the end of its month) and at most 20 years ahead. */
export const isExpiryValid = ({ month, year }: Expiry, nowMs: number): boolean => {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const now = new Date(nowMs);
  const firstDayAfterExpiry = new Date(year, month, 1).getTime();
  return firstDayAfterExpiry > nowMs && year <= now.getFullYear() + MAX_EXPIRY_YEARS_AHEAD;
};

export const isCvcValid = (value: string): boolean => /^\d{3}$/.test(value);

/** 5 to 40 characters: letters (with accents), spaces and the punctuation real names use. */
export const isHolderNameValid = (value: string): boolean => {
  const name = value.trim().replace(/\s+/g, ' ');
  return (
    name.length >= HOLDER_NAME_LENGTH.min &&
    name.length <= HOLDER_NAME_LENGTH.max &&
    HOLDER_NAME.test(name)
  );
};
