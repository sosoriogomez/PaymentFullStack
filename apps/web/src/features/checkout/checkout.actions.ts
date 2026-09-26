import { createAction } from '@reduxjs/toolkit';
import { createAppAsyncThunk, type RootState } from '@/app/hooks';
import { refreshProductStock } from '@/features/catalog/catalog.thunks';
import {
  type Acceptance,
  type CreateTransactionInput,
  type Transaction,
} from '@/shared/api/contracts';
import { type UiError, toUiError } from '@/shared/lib/ui-error';

/** Leaves the checkout and forgets everything about it (also clears the transaction slice). */
export const checkoutReset = createAction('checkout/reset');

/**
 * After a failed final status: that transaction is over, so the next attempt gets a new
 * Idempotency-Key. The delivery draft stays; the card must be entered again (ADR-006).
 */
export const retryWithAnotherCard = createAction<{ productId: string; quantity: number }>(
  'checkout/retryWithAnotherCard',
);

/** Terms the customer must accept, loaded every time the payment form opens (never persisted). */
export const fetchAcceptance = createAppAsyncThunk<Acceptance>(
  'checkout/fetchAcceptance',
  async (_arg, { extra, rejectWithValue }) => {
    const result = await extra.api.getAcceptance();
    return result.ok ? result.value : rejectWithValue(toUiError(result.error));
  },
  { condition: (_arg, { getState }) => getState().checkout.acceptanceStatus !== 'loading' },
);

export const CARD_REENTRY_REQUIRED = 'CARD_REENTRY_REQUIRED';

const presentOrUndefined = (value: string): string | undefined => value.trim() || undefined;

/** The request body: amounts are never sent, the API prices the order again (spec §4.4). */
const toCreateTransactionInput = (
  checkout: RootState['checkout'],
  cardToken: string,
  acceptance: Acceptance,
  customerId: string,
  productId: string,
): CreateTransactionInput => {
  const { contact, delivery } = checkout;
  const addressLine2 = presentOrUndefined(delivery.addressLine2);
  const postalCode = presentOrUndefined(delivery.postalCode);
  return {
    productId,
    quantity: checkout.quantity,
    customerId,
    delivery: {
      recipientName: contact.fullName,
      recipientPhone: contact.phone,
      addressLine1: delivery.addressLine1,
      ...(addressLine2 ? { addressLine2 } : {}),
      city: delivery.city,
      region: delivery.region,
      country: 'CO',
      ...(postalCode ? { postalCode } : {}),
    },
    payment: {
      cardToken,
      installments: checkout.installments,
      acceptanceToken: acceptance.acceptanceToken,
      acceptPersonalAuth: acceptance.personalDataAuthToken,
    },
  };
};

const reentry: UiError = toUiError({ code: CARD_REENTRY_REQUIRED });

/**
 * "Pagar" (spec FE-07): POST /transactions with the purchase's Idempotency-Key. Guarded with
 * `condition`, so a double click never sends two requests. Retrying after a 503 or a network
 * error reuses the same key, which the API turns into a replay instead of a second charge.
 */
export const payOrder = createAppAsyncThunk<Transaction>(
  'checkout/payOrder',
  async (_arg, { getState, extra, dispatch, rejectWithValue }) => {
    const { checkout } = getState();
    const { cardToken, cardTokenExpiresAt, acceptance, customerId, productId, idempotencyKey } =
      checkout;
    const usable = cardToken && cardTokenExpiresAt && cardTokenExpiresAt > extra.clock.now();
    if (!usable || !acceptance || !customerId || !productId || !idempotencyKey) {
      return rejectWithValue(reentry); // expired token (I-18) or a refresh lost it
    }
    const input = toCreateTransactionInput(checkout, cardToken, acceptance, customerId, productId);
    const created = await extra.api.createTransaction(input, idempotencyKey);
    if (created.ok) return created.value.transaction;
    if (created.error.code === 'IDEMPOTENCY_CONFLICT') {
      // The key already produced a transaction (e.g. the order was edited): continue with it.
      const existing = await extra.api.findTransactionByIdempotencyKey(idempotencyKey);
      if (existing.ok) return existing.value;
    }
    if (created.error.code === 'INSUFFICIENT_STOCK') void dispatch(refreshProductStock(productId));
    return rejectWithValue(toUiError(created.error));
  },
  { condition: (_arg, { getState }) => getState().checkout.submission.status !== 'pending' },
);
