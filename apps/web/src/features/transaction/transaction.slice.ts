import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type Delivery, type Transaction } from '@/shared/api/contracts';
import { checkoutReset, payOrder } from '@/features/checkout/checkout.actions';

export type PollingState = 'idle' | 'active' | 'timeout';

export interface TransactionState {
  readonly current: Transaction | null;
  readonly delivery: Delivery | null;
  readonly polling: PollingState;
}

export const initialTransactionState: TransactionState = {
  current: null,
  delivery: null,
  polling: 'idle',
};

export const transactionSlice = createSlice({
  name: 'transaction',
  initialState: initialTransactionState,
  reducers: {
    transactionUpdated(state, action: PayloadAction<Transaction>) {
      state.current = action.payload;
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
      .addCase(payOrder.fulfilled, (_state, action) => ({
        ...initialTransactionState,
        current: action.payload,
      }));
  },
});

export const {
  transactionUpdated,
  deliveryLoaded,
  pollingStarted,
  pollingStopped,
  pollingTimedOut,
} = transactionSlice.actions;
