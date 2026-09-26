import { createHash } from 'node:crypto';

export interface SignedEvent {
  readonly data: Readonly<Record<string, unknown>>;
  /** Dotted paths inside `data`, in the order they are concatenated, e.g. `transaction.id`. */
  readonly properties: readonly string[];
  readonly timestamp: number;
}

const valueAt = (data: Readonly<Record<string, unknown>>, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[key]
          : undefined,
      data,
    );

const asText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';

/**
 * Event checksum (spec §6.3): SHA-256 of the values named in `signature.properties` (in order) +
 * timestamp + events secret, in hex. Upper and lower case are the same checksum.
 */
export const eventChecksum = (event: SignedEvent, secret: string): string =>
  createHash('sha256')
    .update(
      `${event.properties.map((path) => asText(valueAt(event.data, path))).join('')}${event.timestamp}${secret}`,
      'utf8',
    )
    .digest('hex');
