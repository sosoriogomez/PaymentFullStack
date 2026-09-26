import { Suspense } from 'react';
import { Navigate } from 'react-router';
import { useAppSelector } from '@/app/hooks';
import { es } from '@/shared/i18n/es';
import { lazyWithPreload } from '@/shared/lib/lazy-with-preload';
import { Modal } from '@/shared/ui/Modal';
import { Spinner } from '@/shared/ui/Spinner';
import { selectCheckoutStep } from '../checkout.selectors';

// The forms (react-hook-form, card rules, brand logos) download apart from the catalog.
const { Component: PaymentFlow, preload: preloadPaymentFlow } = lazyWithPreload(() =>
  import('./PaymentFlow').then((module) => module.PaymentFlow),
);

export { preloadPaymentFlow };

function BusyModal({ label }: { readonly label: string }) {
  return (
    <Modal open title={es.checkout.modalTitle} dismissible={false} onClose={() => undefined}>
      <Spinner label={label} showLabel />
    </Modal>
  );
}

/**
 * Mounted by the product page; renders the checkout only while it is in progress. Thunks never
 * navigate: once the payment is sent (PROCESSING) this container moves to the status page.
 */
export function CheckoutFlow() {
  const step = useAppSelector(selectCheckoutStep);
  const transactionId = useAppSelector((state) => state.transaction.current?.id);
  if (step === 'PROCESSING' && transactionId) {
    return <Navigate to={`/transactions/${transactionId}`} />;
  }
  if (step === 'PROCESSING') {
    // A refresh interrupted the payment: the key is being looked up (recoverCheckout).
    return <BusyModal label={es.checkout.recovering} />;
  }
  if (step !== 'PAYMENT_FORM' && step !== 'SUMMARY') return null;
  return (
    <Suspense fallback={<BusyModal label={es.checkout.opening} />}>
      <PaymentFlow />
    </Suspense>
  );
}
