import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  checkoutReset,
  payOrder,
  retryWithAnotherCard,
} from '@/features/checkout/checkout.actions';
import { type Delivery, type Transaction } from '@/shared/api/contracts';
import { type LoadStatus } from '@/shared/lib/load-status';
import { type UiError } from '@/shared/lib/ui-error';
import { fetchDelivery, fetchTransaction } from './transaction.thunks';

export type PollingState = 'idle' | 'active' | 'timeout';

export interface TransactionState {
  readonly current: Transaction | null;
  readonly delivery: Delivery | null;
  readonly polling: PollingState;
  /** Loading by id (deep link, I-10, or "Consultar de nuevo"). */
  readonly load: { readonly status: LoadStatus; readonly error: UiError | null };
}

export const initialTransactionState: TransactionState = {
  current: null,
  delivery: null,
  polling: 'idle',
  load: { status: 'idle', error: null },
};

export const isFinalStatus = (status: Transaction['status']): boolean => status !== 'PENDING';

export const transactionSlice = createSlice({
  name: 'transaction',
  initialState: initialTransactionState,
  reducers: {
    transactionUpdated(state, action: PayloadAction<Transaction>) {
      state.current = action.payload;
      if (isFinalStatus(action.payload.status)) state.polling = 'idle';
    },
    deliveryLoaded(state, action: PayloadAction<Delivery>) {
      state.delivery = action.payload;
    },
    pollingStarted(state, _action: PayloadAction<{ transactionId: string }>) {
      state.polling = 'active';
    },
    pollingStopped(state) {
      state.polling = 'idle';
    },
    pollingTimedOut(state) {
      state.polling = 'timeout';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkoutReset, () => initialTransactionState)
      .addCase(retryWithAnotherCard, () => initialTransactionState)
      .addCase(payOrder.fulfilled, (_state, action) => ({
        ...initialTransactionState,
        current: action.payload,
      }))
      .addCase(fetchTransaction.pending, (state) => {
        state.load = { status: 'loading', error: null };
      })
      .addCase(fetchTransaction.fulfilled, (state, action) => {
        state.load = { status: 'succeeded', error: null };
        if (state.current?.id !== action.payload.id) state.delivery = null;
        state.current = action.payload;
      })
      .addCase(fetchTransaction.rejected, (state, action) => {
        state.load = {
          status: 'failed',
          error: action.payload ?? { code: 'UNKNOWN', message: action.error.message ?? '' },
        };
      })
      .addCase(fetchDelivery.fulfilled, (state, action) => {
        state.delivery = action.payload;
      });
  },
});

export const {
  transactionUpdated,
  deliveryLoaded,
  pollingStarted,
  pollingStopped,
  pollingTimedOut,
} = transactionSlice.actions;
