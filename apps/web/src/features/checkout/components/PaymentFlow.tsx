import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
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
    </FormProvider>
  );
}

/** Mounted by the product page; renders the checkout only while it is in progress. */
export function CheckoutFlow() {
  const step = useAppSelector(selectCheckoutStep);
  return step === 'PAYMENT_FORM' || step === 'SUMMARY' ? <PaymentFlow /> : null;
}
