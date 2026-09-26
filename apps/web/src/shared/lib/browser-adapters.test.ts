import {
  cryptoIdGenerator,
  documentVisibility,
  MemoryStorage,
  SafeLocalStorage,
  systemClock,
} from './browser-adapters';
import { type KeyValueStorage } from './ports';

describe('browser adapters', () => {
  it('should read the system clock', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1234);

    expect(systemClock.now()).toBe(1234);
  });

  it('should generate uuids with the platform crypto', () => {
    expect(cryptoIdGenerator.uuid()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should store values in memory', () => {
    const storage = new MemoryStorage();

    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
  });
});

describe('SafeLocalStorage', () => {
  it('should use localStorage when it works', () => {
    const storage = new SafeLocalStorage();

    storage.setItem('key', 'value');

    expect(window.localStorage.getItem('key')).toBe('value');
    expect(storage.getItem('key')).toBe('value');
    storage.removeItem('key');
    expect(window.localStorage.getItem('key')).toBeNull();
  });

  it('should degrade to memory when localStorage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const storage = new SafeLocalStorage(() => broken);

    storage.setItem('key', 'lost');
    storage.setItem('key', 'kept');

    expect(storage.getItem('key')).toBe('kept');
    storage.removeItem('key');
    expect(storage.getItem('key')).toBeNull();
  });

  it('should return null when the first read fails', () => {
    const storage = new SafeLocalStorage(() => {
      throw new Error('denied');
    });

    expect(storage.getItem('anything')).toBeNull();
  });
});

describe('documentVisibility', () => {
  const fakeDocument = () => {
    const listeners = new Set<() => void>();
    const doc = {
      hidden: false,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
    const change = (hidden: boolean) => {
      doc.hidden = hidden;
      listeners.forEach((listener) => {
        listener();
      });
    };
    return { doc: doc as unknown as Document, change, listeners };
  };

  it('should resolve immediately when the page is visible', async () => {
    const { doc } = fakeDocument();

    await expect(documentVisibility(doc).whenVisible()).resolves.toBeUndefined();
    expect(documentVisibility(doc).isHidden()).toBe(false);
  });

  it('should wait until the page becomes visible again', async () => {
    const { doc, change, listeners } = fakeDocument();
    change(true);
    const visibility = documentVisibility(doc);
    let resolved = false;

    const waiting = visibility.whenVisible().then(() => {
      resolved = true;
    });
    change(true);
    await Promise.resolve();
    expect(resolved).toBe(false);
    change(false);
    await waiting;

    expect(resolved).toBe(true);
    expect(listeners.size).toBe(0);
  });
});
