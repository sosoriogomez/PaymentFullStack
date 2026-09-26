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

export type AlertContext = Readonly<Record<string, string | number>>;

/**
 * Business anomalies that need a person (amount mismatch, backorder). Context carries ids and
 * amounts only, never personal or card data.
 */
export interface AlertLog {
  warn(event: string, context: AlertContext): void;
  error(event: string, context: AlertContext): void;
}
export const ALERT_LOG = Symbol('AlertLog');
