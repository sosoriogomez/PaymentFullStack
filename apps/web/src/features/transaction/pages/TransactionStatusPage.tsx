import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { retryWithAnotherCard } from '@/features/checkout/checkout.actions';
import { es } from '@/shared/i18n/es';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { DeliveryDetails, TransactionDetails } from '../components/TransactionDetails';
import { StatusActions } from '../components/StatusActions';
import { StatusHeader } from '../components/StatusHeader';
import styles from '../components/TransactionStatus.module.css';
import { selectTransactionState } from '../transaction.selectors';
import { isFinalStatus, pollingStarted, pollingStopped } from '../transaction.slice';
import { fetchDelivery, fetchTransaction, returnToStore } from '../transaction.thunks';

/** Steps 4 → 5: waits for the final status, shows it and leads back to the store. */
export function TransactionStatusPage() {
  const { transactionId = '' } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { current, delivery, polling, load } = useAppSelector(selectTransactionState);
  const transaction = current?.id === transactionId ? current : null;
  const pending = transaction?.status === 'PENDING';
  const deliveryId = transaction?.status === 'APPROVED' ? transaction.deliveryId : null;

  // Deep link without saved state (I-10): load it by id, once. Leaving the page resets the
  // checkout while it is still mounted, and that must not bring the transaction back.
  const requestedId = useRef<string | null>(null);
  useEffect(() => {
    if (requestedId.current === transactionId) return;
    requestedId.current = transactionId;
    if (!transaction) void dispatch(fetchTransaction(transactionId));
  }, [dispatch, transaction, transactionId]);

  useEffect(() => {
    if (!pending) return undefined;
    dispatch(pollingStarted({ transactionId }));
    return () => {
      dispatch(pollingStopped());
    };
  }, [dispatch, pending, transactionId]);

  useEffect(() => {
    if (deliveryId && delivery?.id !== deliveryId) void dispatch(fetchDelivery(deliveryId));
  }, [dispatch, deliveryId, delivery?.id]);

  const backToStore = useCallback(() => {
    dispatch(returnToStore());
    void navigate('/');
  }, [dispatch, navigate]);

  if (!transaction) {
    return load.status === 'failed' ? (
      <section className={styles.page}>
        <Alert tone="error">
          {load.error?.code === 'TRANSACTION_NOT_FOUND' ? es.status.notFound : es.status.loadError}
        </Alert>
        <Link to="/">{es.status.backToStore}</Link>
      </section>
    ) : (
      <Spinner label={es.status.loading} showLabel />
    );
  }

  const final = isFinalStatus(transaction.status);
  const tryAnotherCard = () => {
    dispatch(
      retryWithAnotherCard({
        productId: transaction.product.id,
        quantity: transaction.product.quantity,
      }),
    );
    void navigate('/');
  };

  return (
    <section className={styles.page}>
      <StatusHeader status={transaction.status} polling={polling} />
      <TransactionDetails transaction={transaction} />
      {delivery?.id === deliveryId ? <DeliveryDetails delivery={delivery} /> : null}
      {polling === 'timeout' && pending ? (
        <Button variant="secondary" onClick={() => dispatch(pollingStarted({ transactionId }))}>
          {es.status.checkAgain}
        </Button>
      ) : null}
      <StatusActions
        final={final}
        failed={final && transaction.status !== 'APPROVED'}
        onBackToStore={backToStore}
        onTryAnotherCard={tryAnotherCard}
      />
    </section>
  );
}
