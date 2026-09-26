/** Public, human-readable number of a transaction: `TX-<ULID>`. */
export interface ReferenceGenerator {
  next(): string;
}

export const REFERENCE_GENERATOR = Symbol('ReferenceGenerator');
