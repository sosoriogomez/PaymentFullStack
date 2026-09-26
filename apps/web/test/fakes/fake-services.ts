import { type AppServices } from '@/app/services';
import { type CardTokenizer, type CheckoutApi } from '@/shared/api/ports';
import { MemoryStorage } from '@/shared/lib/browser-adapters';
import { type Clock, type IdGenerator, type PageVisibility } from '@/shared/lib/ports';
import { err } from '@/shared/lib/result';

const notConfigured = (method: string) =>
  jest.fn(() =>
    Promise.resolve(
      err({ code: 'NOT_CONFIGURED', status: null, detail: `${method} not configured` }),
    ),
  );

/** Listing every method as a record makes a new port method without a fake a compile error. */
const API_METHODS: Readonly<Record<keyof CheckoutApi, true>> = {
  listProducts: true,
  getProductStock: true,
  getAcceptance: true,
  getQuote: true,
  registerCustomer: true,
  createTransaction: true,
  getTransaction: true,
  findTransactionByIdempotencyKey: true,
  getDelivery: true,
};

/** Every API method is a jest.fn; tests configure only what they use. */
export const createFakeApi = (): jest.Mocked<CheckoutApi> =>
  Object.fromEntries(
    Object.keys(API_METHODS).map((method) => [method, notConfigured(method)]),
  ) as unknown as jest.Mocked<CheckoutApi>;

export const createFakeTokenizer = (): jest.Mocked<CardTokenizer> =>
  ({ tokenize: notConfigured('tokenize') }) as unknown as jest.Mocked<CardTokenizer>;

export class FixedClock implements Clock {
  constructor(private current = Date.parse('2026-10-01T15:00:00Z')) {}

  now(): number {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  uuid(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

export class FakePageVisibility implements PageVisibility {
  hidden = false;
  private waiters: (() => void)[] = [];

  isHidden(): boolean {
    return this.hidden;
  }

  whenVisible(): Promise<void> {
    if (!this.hidden) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  show(): void {
    this.hidden = false;
    this.waiters.forEach((resolve) => {
      resolve();
    });
    this.waiters = [];
  }
}

export interface FakeServices extends AppServices {
  readonly api: jest.Mocked<CheckoutApi>;
  readonly cardTokenizer: jest.Mocked<CardTokenizer>;
  readonly storage: MemoryStorage;
  readonly clock: FixedClock;
  readonly idGenerator: SequentialIdGenerator;
  readonly pageVisibility: FakePageVisibility;
}

export const createFakeServices = (): FakeServices => ({
  api: createFakeApi(),
  cardTokenizer: createFakeTokenizer(),
  storage: new MemoryStorage(),
  clock: new FixedClock(),
  idGenerator: new SequentialIdGenerator(),
  pageVisibility: new FakePageVisibility(),
});
