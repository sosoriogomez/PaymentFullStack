import { ACCEPTANCE, aDelivery, aTransaction, PRODUCT_ID, someAmounts } from '@test/builders';
import { FixedClock } from '@test/fakes/fake-services';
import { createAppStore, type RootState } from '@/app/store';
import { createFakeServices } from '@test/fakes/fake-services';
import { initialCheckoutState } from '@/features/checkout/checkout.slice';
import { initialTransactionState } from '@/features/transaction/transaction.slice';
import { MemoryStorage } from '@/shared/lib/browser-adapters';
import {
  loadPersistedState,
  PERSISTED_STATE_TTL_MS,
  savePersistedState,
  selectPersistableState,
  STORAGE_KEY,
} from './persisted-state';

const KEY = '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f';

const summaryState = (): Pick<RootState, 'checkout' | 'transaction'> => ({
  checkout: {
    ...initialCheckoutState,
    step: 'SUMMARY',
    productId: PRODUCT_ID,
    quantity: 2,
    contact: { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' },
    delivery: {
      addressLine1: 'Cra 43A # 1-50',
      addressLine2: '',
      city: 'Medellín',
      region: 'Antioquia',
      postalCode: '',
    },
    customerId: 'c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f',
    card: { brand: 'VISA', lastFour: '4242', holderName: 'Ana Pérez' },
    cardToken: 'tok_secret_card_token',
    cardTokenExpiresAt: 1,
    acceptance: ACCEPTANCE,
    acceptanceStatus: 'succeeded',
    quote: someAmounts(),
    idempotencyKey: KEY,
    submission: { status: 'pending', error: null },
  },
  transaction: {
    ...initialTransactionState,
    current: aTransaction(),
    delivery: aDelivery(),
    polling: 'active',
  },
});

const storeWith = (state: Pick<RootState, 'checkout' | 'transaction'>) =>
  createAppStore(createFakeServices(), state).getState();

describe('persisted state', () => {
  const setup = () => ({ storage: new MemoryStorage(), clock: new FixedClock() });

  it('should restore the checkout and the transaction after a refresh', () => {
    const { storage, clock } = setup();
    savePersistedState(storage, clock, selectPersistableState(storeWith(summaryState())));

    const restored = loadPersistedState(storage, clock);

    expect(restored?.checkout).toMatchObject({
      step: 'SUMMARY',
      productId: PRODUCT_ID,
      quantity: 2,
      contact: { email: 'ana@mail.com' },
      delivery: { city: 'Medellín' },
      card: { lastFour: '4242' },
      idempotencyKey: KEY,
    });
    expect(restored?.transaction).toMatchObject({ current: aTransaction(), delivery: aDelivery() });
  });

  it('should never store the card token, the acceptance tokens or request statuses', () => {
    const { storage, clock } = setup();

    savePersistedState(storage, clock, selectPersistableState(storeWith(summaryState())));

    const raw = storage.getItem(STORAGE_KEY) ?? '';
    expect(raw).not.toContain('tok_secret_card_token');
    expect(raw).not.toContain(ACCEPTANCE.acceptanceToken);
    expect(raw).not.toContain('cardTokenExpiresAt');
    expect(raw).not.toContain('submission');
    expect(raw).not.toContain('polling');
    const restored = loadPersistedState(storage, clock);
    expect(restored?.checkout).toMatchObject({
      cardToken: null,
      cardTokenExpiresAt: null,
      acceptance: null,
      submission: { status: 'idle', error: null },
    });
    expect(restored?.transaction.polling).toBe('idle');
  });

  it('should remove the key when there is nothing to restore', () => {
    const { storage, clock } = setup();
    storage.setItem(STORAGE_KEY, 'previous');

    savePersistedState(
      storage,
      clock,
      selectPersistableState(
        storeWith({ checkout: initialCheckoutState, transaction: initialTransactionState }),
      ),
    );

    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('should discard drafts older than 30 minutes', () => {
    const { storage, clock } = setup();
    savePersistedState(storage, clock, selectPersistableState(storeWith(summaryState())));

    clock.advance(PERSISTED_STATE_TTL_MS + 1);

    expect(loadPersistedState(storage, clock)).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['another version', JSON.stringify({ version: 2, savedAt: 0, data: {} })],
    [
      'an invalid shape',
      JSON.stringify({ version: 1, savedAt: Date.parse('2026-10-01T15:00:00Z'), data: {} }),
    ],
  ])('should start clean with %s', (_, raw) => {
    const { storage, clock } = setup();
    storage.setItem(STORAGE_KEY, raw);

    expect(loadPersistedState(storage, clock)).toBeUndefined();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('should start clean when nothing was saved', () => {
    const { storage, clock } = setup();

    expect(loadPersistedState(storage, clock)).toBeUndefined();
  });
});
