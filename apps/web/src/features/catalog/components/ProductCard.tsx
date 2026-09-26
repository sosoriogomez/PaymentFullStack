import { useId, useState } from 'react';
import { MAX_QUANTITY } from '@/features/checkout/checkout.slice';
import { type Product } from '@/shared/api/contracts';
import { es } from '@/shared/i18n/es';
import { formatCOP } from '@/shared/lib/money';
import { Button } from '@/shared/ui/Button';
import styles from './ProductCard.module.css';
import { ProductImage } from './ProductImage';
import { QuantitySelector } from './QuantitySelector';
import { StockBadge } from './StockBadge';

export interface ProductCardProps {
  readonly product: Product;
  readonly priority?: boolean;
  readonly onBuy: (productId: string, quantity: number) => void;
}

export function ProductCard({ product, priority = false, onBuy }: ProductCardProps) {
  const titleId = useId();
  const maxQuantity = Math.min(product.stock, MAX_QUANTITY);
  const [requested, setQuantity] = useState(1);
  const quantity = Math.max(1, Math.min(requested, maxQuantity));
  const soldOut = product.stock === 0;

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <ProductImage imageKey={product.imageKey} alt={product.name} priority={priority} />
      <div className={styles.body}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.name}>
            {product.name}
          </h2>
          <StockBadge stock={product.stock} />
        </div>
        <p className={styles.description}>{product.description}</p>
        <p className={styles.price}>{formatCOP(product.priceInCents)}</p>
        <div className={styles.actions}>
          <QuantitySelector
            value={quantity}
            max={Math.max(maxQuantity, 1)}
            onChange={setQuantity}
            disabled={soldOut}
          />
          <Button
            fullWidth
            disabled={soldOut}
            onClick={() => {
              onBuy(product.id, quantity);
            }}
          >
            {es.catalog.payWithCard}
          </Button>
        </div>
      </div>
    </article>
  );
}
