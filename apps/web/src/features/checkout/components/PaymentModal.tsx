import { useEffect, useId } from 'react';
import { useFormContext } from 'react-hook-form';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { es } from '@/shared/i18n/es';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { fetchAcceptance } from '../checkout.actions';
import { selectAcceptance, selectCheckout } from '../checkout.selectors';
import { paymentFormClosed } from '../checkout.slice';
import { type PaymentFormValues } from '../domain/payment-form-schema';
import { CardFields } from './CardFields';
import styles from './CheckoutForm.module.css';
import { DeliveryFields } from './DeliveryFields';
import { TermsAcceptance } from './TermsAcceptance';

export interface PaymentModalProps {
  readonly open: boolean;
  readonly onSubmit: (values: PaymentFormValues) => void;
}

/** Step 2: card + delivery + terms. "Continuar" stays disabled until everything is valid. */
export function PaymentModal({ open, onSubmit }: PaymentModalProps) {
  const dispatch = useAppDispatch();
  const formId = useId();
  const { acceptance, status } = useAppSelector(selectAcceptance);
  const { submission, cardReentryRequired } = useAppSelector(selectCheckout);
  const {
    handleSubmit,
    formState: { isValid },
  } = useFormContext<PaymentFormValues>();
  const pending = submission.status === 'pending';

  // Acceptance tokens are short lived: fetched every time the form opens.
  useEffect(() => {
    if (open) void dispatch(fetchAcceptance());
  }, [dispatch, open]);

  return (
    <Modal
      open={open}
      title={es.checkout.modalTitle}
      closeLabel={es.checkout.close}
      dismissible={!pending}
      onClose={() => dispatch(paymentFormClosed())}
      footer={
        <Button
          type="submit"
          form={formId}
          fullWidth
          disabled={!isValid || pending}
          loading={pending}
        >
          {es.checkout.continue}
        </Button>
      }
    >
      <form
        id={formId}
        className={styles.form}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      >
        {submission.error ? <Alert tone="error">{submission.error.message}</Alert> : null}
        <CardFields reentryRequired={cardReentryRequired} />
        <DeliveryFields />
        <TermsAcceptance
          acceptance={acceptance}
          status={status}
          onRetry={() => void dispatch(fetchAcceptance())}
        />
      </form>
    </Modal>
  );
}
