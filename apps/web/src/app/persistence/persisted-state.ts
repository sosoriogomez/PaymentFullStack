import { type RootState } from '@/app/store';
import { initialCheckoutState } from '@/features/checkout/checkout.slice';
import { initialTransactionState } from '@/features/transaction/transaction.slice';
import { type Clock, type KeyValueStorage } from '@/shared/lib/ports';
import {
  PERSISTED_STATE_VERSION,
  type PersistedEnvelope,
  persistedEnvelopeSchema,
} from './persisted-state.schema';

export const STORAGE_KEY = 'checkout-app:v1';
/** Drafts with personal data expire (M-13): 30 minutes. */
export const PERSISTED_STATE_TTL_MS = 30 * 60_000;

export type PersistableState = PersistedEnvelope['data'];

/** Picks what may be saved: never the card token, the acceptance tokens or request statuses. */
export const selectPersistableState = (state: RootState): PersistableState => {
  const { checkout, transaction } = state;
  return {
    checkout: {
      step: checkout.step,
      productId: checkout.productId,
      quantity: checkout.quantity,
      contact: checkout.contact,
      delivery: checkout.delivery,
      customerId: checkout.customerId,
      card: checkout.card,
      installments: checkout.installments,
      quote: checkout.quote,
      idempotencyKey: checkout.idempotencyKey,
      cardReentryRequired: checkout.cardReentryRequired,
    },
    transaction: { current: transaction.current, delivery: transaction.delivery },
  };
};

/** Nothing worth restoring: back at the product with no transaction in progress. */
export const isPristine = ({ checkout, transaction }: PersistableState): boolean =>
  checkout.step === 'PRODUCT' && transaction.current === null;

export function savePersistedState(
  storage: KeyValueStorage,
  clock: Clock,
  data: PersistableState,
): void {
  if (isPristine(data)) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  const envelope: PersistedEnvelope = {
    version: PERSISTED_STATE_VERSION,
    savedAt: clock.now(),
    data,
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * Restores the checkout after a refresh. Anything unexpected (corrupt JSON, another version,
 * an invalid shape or an expired draft) is discarded and the app starts clean.
 */
export function loadPersistedState(
  storage: KeyValueStorage,
  clock: Clock,
): Pick<RootState, 'checkout' | 'transaction'> | undefined {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return undefined;
  const parsed = persistedEnvelopeSchema.safeParse(parse(raw));
  if (!parsed.success || clock.now() - parsed.data.savedAt > PERSISTED_STATE_TTL_MS) {
    storage.removeItem(STORAGE_KEY);
    return undefined;
  }
  const { checkout, transaction } = parsed.data.data;
  return {
    checkout: { ...initialCheckoutState, ...checkout },
    transaction: { ...initialTransactionState, ...transaction },
  };
}
