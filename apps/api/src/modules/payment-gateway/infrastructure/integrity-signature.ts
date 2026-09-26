import { createHash } from 'node:crypto';

export interface SignedAmount {
  readonly reference: string;
  readonly amountInCents: number;
  readonly currency: string;
}

/**
 * Integrity signature of a charge: SHA-256 of reference + amount in cents + currency + secret.
 * Computed only on the server (the secret never reaches the browser); it stops amount tampering.
 */
export const integritySignature = (
  { reference, amountInCents, currency }: SignedAmount,
  secret: string,
): string =>
  createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${secret}`, 'utf8')
    .digest('hex');
