/** Time source injected into effects so polling, TTLs and countdowns are testable. */
export interface Clock {
  now(): number;
}

export interface IdGenerator {
  uuid(): string;
}

/** Minimal key/value storage (localStorage in the browser, memory in tests or private mode). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PageVisibility {
  isHidden(): boolean;
  /** Resolves the next time the page becomes visible (immediately if it already is). */
  whenVisible(): Promise<void>;
}
