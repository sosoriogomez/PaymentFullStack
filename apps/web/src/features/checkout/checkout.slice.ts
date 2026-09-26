import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type UiError } from '@/shared/lib/ui-error';
import {
  CARD_REENTRY_REQUIRED,
  checkoutReset,
  fetchAcceptance,
  payOrder,
  retryWithAnotherCard,
} from './checkout.actions';
import { transactionUpdated } from '@/features/transaction/transaction.slice';
import {
  type AcceptedPaymentForm,
  type ContactDraft,
  type DeliveryDraft,
  initialCheckoutState,
  reentryState,
} from './checkout.state';

export * from './checkout.state';

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
      .addCase(retryWithAnotherCard, (state, action) => ({
        ...initialCheckoutState,
        contact: state.contact,
        delivery: state.delivery,
        installments: state.installments,
        productId: action.payload.productId,
        quantity: action.payload.quantity,
        step: 'PAYMENT_FORM' as const,
      }))
      .addCase(transactionUpdated, (state, action) => {
        if (state.step === 'PROCESSING' && action.payload.status !== 'PENDING')
          state.step = 'RESULT';
      })
      .addCase(fetchAcceptance.pending, (state) => {
        state.acceptanceStatus = 'loading';
      })
      .addCase(fetchAcceptance.fulfilled, (state, action) => {
        state.acceptance = action.payload;
        state.acceptanceStatus = 'succeeded';
      })
      .addCase(fetchAcceptance.rejected, (state) => {
        state.acceptanceStatus = 'failed';
      })
      .addCase(payOrder.pending, (state) => {
        state.submission = { status: 'pending', error: null };
      })
      .addCase(payOrder.fulfilled, (state) => {
        // The card token is single use: once the charge exists it is forgotten.
        state.step = 'PROCESSING';
        state.cardToken = null;
        state.cardTokenExpiresAt = null;
        state.submission = { status: 'idle', error: null };
      })
      .addCase(payOrder.rejected, (state, action) => {
        const error = action.payload ?? { code: 'UNKNOWN', message: action.error.message ?? '' };
        if (error.code === CARD_REENTRY_REQUIRED) {
          Object.assign(state, reentryState);
          return;
        }
        state.submission = { status: 'failed', error };
        if (error.code === 'INSUFFICIENT_STOCK') state.step = 'PRODUCT';
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
