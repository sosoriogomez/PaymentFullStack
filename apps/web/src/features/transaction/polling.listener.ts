import { type ForkedTaskAPI, isAnyOf } from '@reduxjs/toolkit';
import { type AppServices, type AppStartListening } from '@/app/hooks';
import { checkoutReset } from '@/features/checkout/checkout.actions';
import {
  isFinalStatus,
  pollingStarted,
  pollingStopped,
  pollingTimedOut,
  transactionUpdated,
} from './transaction.slice';

/** 2 s, 2 s, 3 s, 3 s and then every 5 s (spec FE-08). */
export const POLLING_DELAYS_MS = [2000, 2000, 3000, 3000, 5000] as const;
/** After 90 s of waiting the page offers "Consultar de nuevo" instead of polling forever. */
export const POLLING_MAX_MS = 90_000;

const delayFor = (attempt: number): number =>
  POLLING_DELAYS_MS[Math.min(attempt, POLLING_DELAYS_MS.length - 1)] ?? 5000;

type Dispatch = (action: ReturnType<typeof transactionUpdated | typeof pollingTimedOut>) => unknown;

/**
 * Polls GET /transactions/:id until a final status. Every wait is cancelable (fork.delay/pause):
 * leaving the page, a reset or a new polling cancels it. A hidden tab pauses it (no requests
 * while nobody looks); the time spent hidden does not count against the 90 s.
 */
async function pollUntilFinal(
  transactionId: string,
  fork: ForkedTaskAPI,
  { api, pageVisibility }: AppServices,
  dispatch: Dispatch,
): Promise<void> {
  let waitedMs = 0;
  for (let attempt = 0; waitedMs < POLLING_MAX_MS; attempt += 1) {
    const delayMs = delayFor(attempt);
    await fork.delay(delayMs);
    waitedMs += delayMs;
    if (pageVisibility.isHidden()) await fork.pause(pageVisibility.whenVisible());
    const result = await fork.pause(api.getTransaction(transactionId));
    if (result.ok) {
      dispatch(transactionUpdated(result.value));
      if (isFinalStatus(result.value.status)) return;
    }
  }
  dispatch(pollingTimedOut());
}

export function registerPollingListener(startListening: AppStartListening): void {
  startListening({
    actionCreator: pollingStarted,
    effect: async ({ payload }, listenerApi) => {
      listenerApi.cancelActiveListeners();
      const task = listenerApi.fork((fork) =>
        pollUntilFinal(payload.transactionId, fork, listenerApi.extra, listenerApi.dispatch),
      );
      await Promise.race([task.result, listenerApi.take(isAnyOf(pollingStopped, checkoutReset))]);
      task.cancel();
    },
  });
}
