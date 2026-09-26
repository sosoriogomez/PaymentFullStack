import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/**
 * Compares secrets without leaking, through timing, how many characters match. Hashing first
 * gives both buffers the same length, as timingSafeEqual requires.
 */
export const constantTimeEquals = (received: string, expected: string): boolean =>
  timingSafeEqual(digest(received), digest(expected));
