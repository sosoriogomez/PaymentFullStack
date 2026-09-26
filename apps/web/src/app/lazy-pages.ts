import { preloadPaymentFlow } from '@/features/checkout/components/CheckoutFlow';
import { lazyWithPreload } from '@/shared/lib/lazy-with-preload';

// Step 4 is only reached after paying (or by a deep link): it downloads apart from the catalog.
export const { Component: TransactionStatusPage, preload: preloadTransactionStatusPage } =
  lazyWithPreload(() =>
    import('@/features/transaction/pages/TransactionStatusPage').then(
      (module) => module.TransactionStatusPage,
    ),
  );

/** Everything the catalog does not need at first paint, fetched once the page is idle. */
export const preloadDeferredChunks = () =>
  Promise.all([preloadPaymentFlow(), preloadTransactionStatusPage()]);
