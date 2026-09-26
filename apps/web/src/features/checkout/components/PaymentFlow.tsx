import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { FormProvider, useForm } from 'react-hook-form';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { selectCheckoutStep, selectDeliveryDefaults } from '../checkout.selectors';
import { submitPaymentForm } from '../checkout.thunks';
import {
  createPaymentFormSchema,
  initialPaymentForm,
  type PaymentFormValues,
} from '../domain/payment-form-schema';
import { PaymentModal } from './PaymentModal';
import { SummaryBackdrop } from './SummaryBackdrop';
import { useDraftSync } from './useDraftSync';

/**
 * Owns the payment form while the customer is between steps 2 and 3, so "Editar" keeps what was
 * typed. It unmounts on any other step, and the card data typed here goes away with it.
 */
export function PaymentFlow() {
  const dispatch = useAppDispatch();
  const step = useAppSelector(selectCheckoutStep);
  const drafts = useAppSelector(selectDeliveryDefaults);
  const [schema] = useState(() => createPaymentFormSchema());
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: initialPaymentForm(drafts),
  });
  useDraftSync(form.control);

  return (
    <FormProvider {...form}>
      <PaymentModal
        open={step === 'PAYMENT_FORM'}
        onSubmit={(values) => void dispatch(submitPaymentForm(values))}
      />
      <SummaryBackdrop open={step === 'SUMMARY'} />
    </FormProvider>
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
  return step === 'PAYMENT_FORM' || step === 'SUMMARY' ? <PaymentFlow /> : null;
}
