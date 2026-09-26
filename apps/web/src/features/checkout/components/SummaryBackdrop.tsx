import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { es } from '@/shared/i18n/es';
import { formatCOP } from '@/shared/lib/money';
import { Alert } from '@/shared/ui/Alert';
import { Backdrop } from '@/shared/ui/Backdrop';
import { Button } from '@/shared/ui/Button';
import { payOrder } from '../checkout.actions';
import { type OrderSummary, selectOrderSummary, selectSubmission } from '../checkout.selectors';
import { summaryEditRequested } from '../checkout.slice';
import { toCardBrand } from '../domain/card-number';
import { CardBrandLogo } from './CardBrandLogo';
import styles from './SummaryBackdrop.module.css';

const texts = es.summary;

function Breakdown({ summary }: { summary: OrderSummary }) {
  const { amounts } = summary;
  const rows = [
    [texts.product(summary.productName, summary.quantity), amounts.product],
    [texts.baseFee, amounts.baseFee],
    [texts.deliveryFee, amounts.deliveryFee],
  ] as const;
  return (
    <dl className={styles.breakdown} aria-label={texts.breakdown}>
      {rows.map(([label, cents]) => (
        <div key={label} className={styles.row}>
          <dt>{label}</dt>
          <dd>{formatCOP(cents)}</dd>
        </div>
      ))}
      <div className={`${styles.row} ${styles.total}`}>
        <dt>{texts.total}</dt>
        <dd>{formatCOP(amounts.total)}</dd>
      </div>
    </dl>
  );
}

function PaymentAndDelivery({ summary }: { summary: OrderSummary }) {
  const { brand, lastFour } = summary.card;
  return (
    <div className={styles.details}>
      <section aria-labelledby="summary-payment">
        <h3 id="summary-payment" className={styles.subtitle}>
          {texts.paymentMethod}
        </h3>
        <p className={styles.card}>
          <CardBrandLogo brand={toCardBrand(brand)} />
          <span>
            {brand} •••• {lastFour}
          </span>
        </p>
        <p className={styles.muted}>{texts.installments(summary.installments)}</p>
      </section>
      <section aria-labelledby="summary-delivery">
        <h3 id="summary-delivery" className={styles.subtitle}>
          {texts.deliverTo}
        </h3>
        <p>{summary.recipient}</p>
        <p className={styles.muted}>{summary.address}</p>
      </section>
    </div>
  );
}

/** Step 3 (Material Backdrop): the product stays behind, the summary and "Pagar" slide up. */
export function SummaryBackdrop({ open }: { readonly open: boolean }) {
  const dispatch = useAppDispatch();
  const summary = useAppSelector(selectOrderSummary);
  const submission = useAppSelector(selectSubmission);
  const pending = submission.status === 'pending';
  if (!summary) return null;

  const edit = () => dispatch(summaryEditRequested());
  const payLabel = submission.error ? texts.retry : texts.pay(formatCOP(summary.amounts.total));

  return (
    <Backdrop
      open={open}
      title={texts.title}
      onEscape={pending ? undefined : edit}
      backLayer={
        <p className={styles.context}>{texts.product(summary.productName, summary.quantity)}</p>
      }
      headerAction={
        <Button variant="ghost" onClick={edit} disabled={pending}>
          {texts.edit}
        </Button>
      }
      footer={
        <Button fullWidth loading={pending} onClick={() => void dispatch(payOrder())}>
          {pending ? texts.paying : payLabel}
        </Button>
      }
    >
      {submission.error ? (
        <Alert tone="error">
          {texts.payFailed} {submission.error.message} {texts.safeRetry}
        </Alert>
      ) : null}
      <Breakdown summary={summary} />
      <PaymentAndDelivery summary={summary} />
    </Backdrop>
  );
}
