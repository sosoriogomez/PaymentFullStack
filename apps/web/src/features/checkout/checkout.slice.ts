import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type Acceptance, type OrderAmounts } from '@/shared/api/contracts';
import { type LoadStatus } from '@/shared/lib/load-status';
import { type UiError } from '@/shared/lib/ui-error';
import { checkoutReset, fetchAcceptance } from './checkout.actions';

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
  readonly acceptanceStatus: LoadStatus;
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
  acceptanceStatus: 'idle',
  quote: null,
  idempotencyKey: null,
  cardReentryRequired: false,
  submission: { status: 'idle', error: null },
};

/** Everything the payment form produced, except card data: only its metadata and the token. */
export interface AcceptedPaymentForm {
  readonly card: CardSummary;
  readonly cardToken: string;
  readonly cardTokenExpiresAt: number;
  readonly customerId: string;
  readonly quote: OrderAmounts;
  readonly installments: number;
  readonly contact: ContactDraft;
  readonly delivery: DeliveryDraft;
  readonly idempotencyKey: string;
}

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
    paymentFormSubmitted(state) {
      state.submission = { status: 'pending', error: null };
    },
    paymentFormAccepted(state, action: PayloadAction<AcceptedPaymentForm>) {
      Object.assign(state, action.payload);
      state.step = 'SUMMARY';
      state.cardReentryRequired = false;
      state.submission = { status: 'idle', error: null };
    },
    paymentFormFailed(state, action: PayloadAction<UiError>) {
      state.submission = { status: 'failed', error: action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkoutReset, () => initialCheckoutState)
      .addCase(fetchAcceptance.pending, (state) => {
        state.acceptanceStatus = 'loading';
      })
      .addCase(fetchAcceptance.fulfilled, (state, action) => {
        state.acceptance = action.payload;
        state.acceptanceStatus = 'succeeded';
      })
      .addCase(fetchAcceptance.rejected, (state) => {
        state.acceptanceStatus = 'failed';
      });
  },
});

export const {
  checkoutStarted,
  paymentFormClosed,
  contactDraftUpdated,
  deliveryDraftUpdated,
  summaryEditRequested,
  paymentFormSubmitted,
  paymentFormAccepted,
  paymentFormFailed,
} = checkoutSlice.actions;
