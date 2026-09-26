import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type Acceptance, type OrderAmounts } from '@/shared/api/contracts';
import { type UiError } from '@/shared/lib/ui-error';
import { checkoutReset } from './checkout.actions';

export const CHECKOUT_STEPS = [
  'PRODUCT',
  'PAYMENT_FORM',
  'SUMMARY',
  'PROCESSING',
  'RESULT',
] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

export const MAX_QUANTITY = 10;
export const DEFAULT_INSTALLMENTS = 1;
export const MAX_INSTALLMENTS = 36;

export interface ContactDraft {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
}

export interface DeliveryDraft {
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
}

/** Only card metadata ever reaches the store: never the number, the CVC or the expiry date. */
export interface CardSummary {
  readonly brand: string;
  readonly lastFour: string;
  readonly holderName: string;
}

export type RequestStatus = 'idle' | 'pending' | 'failed';

export interface CheckoutState {
  readonly step: CheckoutStep;
  readonly productId: string | null;
  readonly quantity: number;
  readonly contact: ContactDraft;
  readonly delivery: DeliveryDraft;
  readonly customerId: string | null;
  readonly card: CardSummary | null;
  /** In memory only: excluded from persistence (ADR-002). */
  readonly cardToken: string | null;
  readonly cardTokenExpiresAt: number | null;
  readonly installments: number;
  /** Tokens are short lived and must be accepted explicitly every time: never persisted. */
  readonly acceptance: Acceptance | null;
  readonly quote: OrderAmounts | null;
  /** One per purchase attempt; survives refreshes and card re-entry (C-04, ADR-006). */
  readonly idempotencyKey: string | null;
  readonly cardReentryRequired: boolean;
  readonly submission: { readonly status: RequestStatus; readonly error: UiError | null };
}

export const emptyContact: ContactDraft = { fullName: '', email: '', phone: '' };
export const emptyDelivery: DeliveryDraft = {
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
};

export const initialCheckoutState: CheckoutState = {
  step: 'PRODUCT',
  productId: null,
  quantity: 1,
  contact: emptyContact,
  delivery: emptyDelivery,
  customerId: null,
  card: null,
  cardToken: null,
  cardTokenExpiresAt: null,
  installments: DEFAULT_INSTALLMENTS,
  acceptance: null,
  quote: null,
  idempotencyKey: null,
  cardReentryRequired: false,
  submission: { status: 'idle', error: null },
};

export const checkoutSlice = createSlice({
  name: 'checkout',
  initialState: initialCheckoutState,
  reducers: {
    checkoutStarted(state, action: PayloadAction<{ productId: string; quantity: number }>) {
      state.productId = action.payload.productId;
      state.quantity = action.payload.quantity;
      state.step = 'PAYMENT_FORM';
      state.submission = { status: 'idle', error: null };
    },
    paymentFormClosed(state) {
      state.step = 'PRODUCT';
      state.submission = { status: 'idle', error: null };
    },
    contactDraftUpdated(state, action: PayloadAction<Partial<ContactDraft>>) {
      state.contact = { ...state.contact, ...action.payload };
    },
    deliveryDraftUpdated(state, action: PayloadAction<Partial<DeliveryDraft>>) {
      state.delivery = { ...state.delivery, ...action.payload };
    },
    summaryEditRequested(state) {
      state.step = 'PAYMENT_FORM';
    },
  },
  extraReducers: (builder) => {
    builder.addCase(checkoutReset, () => initialCheckoutState);
  },
});

export const {
  checkoutStarted,
  paymentFormClosed,
  contactDraftUpdated,
  deliveryDraftUpdated,
  summaryEditRequested,
} = checkoutSlice.actions;
