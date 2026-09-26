import { createHash } from 'node:crypto';

export const EVENTS_SECRET = 'test-events-secret';
export const SIGNED_PROPERTIES = [
  'transaction.id',
  'transaction.status',
  'transaction.amount_in_cents',
];

export interface EventTransaction {
  readonly id: string;
  readonly reference: string;
  readonly status: string;
  readonly amount_in_cents: number;
  readonly currency?: string;
}

/** A webhook event as the gateway sends it, signed with the given secret. */
export function signedEvent(
  transaction: EventTransaction,
  { secret = EVENTS_SECRET, event = 'transaction.updated', timestamp = 1_790_866_800 } = {},
) {
  const data = { transaction: { currency: 'COP', ...transaction } };
  const concatenated = `${transaction.id}${transaction.status}${transaction.amount_in_cents}`;
  const checksum = createHash('sha256')
    .update(`${concatenated}${timestamp}${secret}`)
    .digest('hex')
    .toUpperCase();
  return {
    event,
    data,
    environment: 'test',
    signature: { properties: SIGNED_PROPERTIES, checksum },
    timestamp,
    sent_at: new Date(timestamp * 1000).toISOString(),
  };
}
