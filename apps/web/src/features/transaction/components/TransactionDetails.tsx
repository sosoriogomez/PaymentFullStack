import { type Delivery, type Transaction } from '@/shared/api/contracts';
import { es } from '@/shared/i18n/es';
import { formatCOP } from '@/shared/lib/money';
import styles from './TransactionStatus.module.css';

const texts = es.status;

export function TransactionDetails({ transaction }: { readonly transaction: Transaction }) {
  const { product, card, amounts } = transaction;
  const rows: readonly (readonly [string, string])[] = [
    [texts.reference, transaction.reference],
    [texts.product, `${product.name} × ${product.quantity}`],
    ...(card ? [[texts.card, `${card.brand} •••• ${card.lastFour}`] as const] : []),
    ...(transaction.status !== 'APPROVED' && transaction.statusMessage
      ? [[texts.reason, transaction.statusMessage] as const]
      : []),
    [texts.total, formatCOP(amounts.total)],
  ];
  return (
    <dl className={styles.details}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.detailRow}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DeliveryDetails({ delivery }: { readonly delivery: Delivery }) {
  const address = [delivery.addressLine1, delivery.addressLine2, delivery.city, delivery.region]
    .filter(Boolean)
    .join(', ');
  return (
    <section className={styles.delivery} aria-labelledby="delivery-title">
      <h2 id="delivery-title" className={styles.subtitle}>
        {texts.deliveryTitle}
      </h2>
      <p>{texts[delivery.status]}</p>
      <p>{delivery.recipientName}</p>
      <p className={styles.muted}>{address}</p>
    </section>
  );
}
