import { type AppThunk } from '@/app/hooks';
import { transactionUpdated } from '@/features/transaction/transaction.slice';
import { checkoutRecovered, paymentRecoveryFailed } from './checkout.actions';

/** 3 lookups: the interrupted POST may still be in flight when the page comes back. */
export const RECOVERY_DELAYS_MS = [0, 1000, 2000] as const;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Refresh during the POST (C-04): ask whether the key produced a transaction. Found → continue
 * with it; not found after 3 tries → back to the form with the SAME key, so if the original POST
 * did arrive, paying again replays it instead of charging twice.
 */
export const recoverByIdempotencyKey =
  (idempotencyKey: string): AppThunk<Promise<void>> =>
  async (dispatch, _getState, { api }) => {
    for (const delayMs of RECOVERY_DELAYS_MS) {
      if (delayMs > 0) await wait(delayMs);
      const found = await api.findTransactionByIdempotencyKey(idempotencyKey);
      if (found.ok) {
        dispatch(transactionUpdated(found.value));
        return;
      }
    }
    dispatch(paymentRecoveryFailed());
  };

/** Runs once at startup with the restored state (spec §2.4). */
export const recoverCheckout = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  dispatch(checkoutRecovered());
  const { checkout, transaction } = getState();
  if (checkout.step !== 'PROCESSING' || transaction.current) return;
  if (checkout.idempotencyKey) await dispatch(recoverByIdempotencyKey(checkout.idempotencyKey));
  else dispatch(paymentRecoveryFailed());
};
