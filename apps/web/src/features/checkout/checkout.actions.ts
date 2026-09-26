import { createAction } from '@reduxjs/toolkit';
import { createAppAsyncThunk } from '@/app/hooks';
import { type Acceptance } from '@/shared/api/contracts';
import { toUiError } from '@/shared/lib/ui-error';

/** Leaves the checkout and forgets everything about it (also clears the transaction slice). */
export const checkoutReset = createAction('checkout/reset');

/** Terms the customer must accept, loaded every time the payment form opens (never persisted). */
export const fetchAcceptance = createAppAsyncThunk<Acceptance>(
  'checkout/fetchAcceptance',
  async (_arg, { extra, rejectWithValue }) => {
    const result = await extra.api.getAcceptance();
    return result.ok ? result.value : rejectWithValue(toUiError(result.error));
  },
  { condition: (_arg, { getState }) => getState().checkout.acceptanceStatus !== 'loading' },
);
