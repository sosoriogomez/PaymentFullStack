import { es } from '@/shared/i18n/es';
import styles from './StockBadge.module.css';

export const LOW_STOCK_THRESHOLD = 3;

export function StockBadge({ stock }: { readonly stock: number }) {
  const tone =
    stock === 0 ? styles.soldOut : stock <= LOW_STOCK_THRESHOLD ? styles.low : styles.available;
  return (
    <span className={`${styles.badge} ${tone}`}>
      {stock === 0 ? es.catalog.soldOut : es.catalog.available(stock)}
    </span>
  );
}
