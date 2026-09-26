/** Time source. Injected so domain rules and tests never depend on the real clock. */
export interface Clock {
  now(): Date;
}
export const CLOCK = Symbol('Clock');

export interface IdGenerator {
  uuid(): string;
}
export const ID_GENERATOR = Symbol('IdGenerator');

export interface Hasher {
  sha256(value: string): string;
}
export const HASHER = Symbol('Hasher');
