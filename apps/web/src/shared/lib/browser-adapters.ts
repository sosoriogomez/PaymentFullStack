import { type Clock, type IdGenerator, type KeyValueStorage, type PageVisibility } from './ports';

export const systemClock: Clock = { now: () => Date.now() };

export const cryptoIdGenerator: IdGenerator = { uuid: () => crypto.randomUUID() };

export class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/**
 * localStorage can throw (Safari private mode, quota exceeded, blocked cookies). Every access is
 * guarded and the adapter degrades to memory, so the checkout keeps working without persistence.
 */
export class SafeLocalStorage implements KeyValueStorage {
  private fallback: KeyValueStorage | null = null;

  constructor(private readonly primary: () => KeyValueStorage = () => window.localStorage) {}

  getItem(key: string): string | null {
    return this.attempt((storage) => storage.getItem(key), null);
  }

  setItem(key: string, value: string): void {
    this.attempt((storage) => {
      storage.setItem(key, value);
    }, undefined);
  }

  removeItem(key: string): void {
    this.attempt((storage) => {
      storage.removeItem(key);
    }, undefined);
  }

  private attempt<T>(operation: (storage: KeyValueStorage) => T, fallbackValue: T): T {
    if (this.fallback) return operation(this.fallback);
    try {
      return operation(this.primary());
    } catch {
      this.fallback = new MemoryStorage();
      return fallbackValue;
    }
  }
}

export const documentVisibility = (doc: Document = document): PageVisibility => ({
  isHidden: () => doc.hidden,
  whenVisible: () =>
    doc.hidden
      ? new Promise<void>((resolve) => {
          const onChange = () => {
            if (doc.hidden) return;
            doc.removeEventListener('visibilitychange', onChange);
            resolve();
          };
          doc.addEventListener('visibilitychange', onChange);
        })
      : Promise.resolve(),
});
