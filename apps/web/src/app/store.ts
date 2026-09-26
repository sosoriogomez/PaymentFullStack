import { combineSlices, configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { catalogSlice } from '@/features/catalog/catalog.slice';
import { checkoutSlice } from '@/features/checkout/checkout.slice';
import { transactionSlice } from '@/features/transaction/transaction.slice';
import { env } from '@/shared/config/env';
import { type AppStartListening } from './hooks';
import { type AppServices } from './services';

export const rootReducer = combineSlices(catalogSlice, checkoutSlice, transactionSlice);
export type RootState = ReturnType<typeof rootReducer>;

/** Registers long-running effects (persistence, polling) on the store's listener middleware. */
export type ListenerRegistration = (startListening: AppStartListening) => void;

export function createAppStore(
  services: AppServices,
  preloadedState?: Partial<RootState>,
  registrations: readonly ListenerRegistration[] = [],
) {
  const listener = createListenerMiddleware({ extra: services });
  registrations.forEach((register) => {
    register(listener.startListening as AppStartListening);
  });
  return configureStore({
    reducer: rootReducer,
    ...(preloadedState ? { preloadedState } : {}),
    devTools: env.isDevelopment,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: services } }).prepend(listener.middleware),
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];
