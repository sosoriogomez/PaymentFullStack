import { type AppStartListening } from '@/app/hooks';
import { savePersistedState, selectPersistableState } from './persisted-state';

export const PERSIST_DEBOUNCE_MS = 300;

const isPersistedSliceAction = (action: { type: string }): boolean =>
  action.type.startsWith('checkout/') || action.type.startsWith('transaction/');

/** Saves the checkout (debounced) after any change, so a refresh can resume it (spec §2.4). */
export function registerPersistenceListener(startListening: AppStartListening): void {
  startListening({
    predicate: (action) => isPersistedSliceAction(action),
    effect: async (_action, listenerApi) => {
      listenerApi.cancelActiveListeners();
      await listenerApi.delay(PERSIST_DEBOUNCE_MS);
      const { storage, clock } = listenerApi.extra;
      savePersistedState(storage, clock, selectPersistableState(listenerApi.getState()));
    },
  });
}
