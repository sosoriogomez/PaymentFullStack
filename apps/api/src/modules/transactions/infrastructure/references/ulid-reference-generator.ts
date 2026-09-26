import { monotonicFactory } from 'ulid';
import { type ReferenceGenerator } from '../../domain/reference-generator.port';

export const REFERENCE_PREFIX = 'TX-';

/**
 * `TX-<ULID>`: unique without a database round trip, sortable by creation time and readable over
 * the phone (Crockford base32, no ambiguous letters).
 */
export class UlidReferenceGenerator implements ReferenceGenerator {
  private readonly ulid = monotonicFactory();

  next(): string {
    return `${REFERENCE_PREFIX}${this.ulid()}`;
  }
}
