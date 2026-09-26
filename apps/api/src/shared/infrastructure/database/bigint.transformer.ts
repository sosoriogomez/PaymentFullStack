import { type ValueTransformer } from 'typeorm';

/**
 * node-postgres returns BIGINT columns as strings (C-05). Amounts are converted back to numbers
 * and must be safe integers; anything else is a data corruption, so it throws.
 */
export const bigintTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | null): number | null => {
    if (value === null) return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new RangeError(`BIGINT value ${value} is not a safe integer`);
    }
    return parsed;
  },
} satisfies ValueTransformer;
