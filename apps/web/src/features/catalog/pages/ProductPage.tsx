import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { checkoutStarted } from '@/features/checkout/checkout.slice';
import { CheckoutFlow } from '@/features/checkout/components/PaymentFlow';
import { es } from '@/shared/i18n/es';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { selectCatalogError, selectCatalogStatus, selectProducts } from '../catalog.selectors';
import { fetchProducts } from '../catalog.thunks';
import { CatalogSkeleton } from '../components/CatalogSkeleton';
import { ProductCard } from '../components/ProductCard';
import styles from './ProductPage.module.css';

/** Steps 1 and 5: the catalog with its stock and the entry point of the checkout. */
export function ProductPage() {
  const dispatch = useAppDispatch();
  const products = useAppSelector(selectProducts);
  const status = useAppSelector(selectCatalogStatus);
  const error = useAppSelector(selectCatalogError);

  useEffect(() => {
    if (status === 'idle') void dispatch(fetchProducts());
  }, [dispatch, status]);

  const onBuy = useCallback(
    (productId: string, quantity: number) => dispatch(checkoutStarted({ productId, quantity })),
    [dispatch],
  );

  return (
    <section className={styles.page} aria-labelledby="catalog-title">
      <h1 id="catalog-title" className={styles.title}>
        {es.catalog.title}
      </h1>
      {status === 'failed' ? (
        <div className={styles.feedback}>
          <Alert tone="error">{error?.message ?? es.catalog.loadError}</Alert>
          <Button variant="secondary" onClick={() => void dispatch(fetchProducts())}>
            {es.catalog.retry}
          </Button>
        </div>
      ) : null}
      {status === 'succeeded' && products.length === 0 ? <p>{es.catalog.empty}</p> : null}
      <div className={styles.grid} aria-busy={status === 'loading'}>
        {status === 'loading' || status === 'idle' ? <CatalogSkeleton /> : null}
        {status === 'succeeded'
          ? products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={index === 0}
                onBuy={onBuy}
              />
            ))
          : null}
      </div>
      <CheckoutFlow />
    </section>
  );
}
