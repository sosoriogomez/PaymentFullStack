import { Skeleton } from '@/shared/ui/Skeleton';
import styles from './ProductCard.module.css';

/** Same box as a real card so nothing moves when the products arrive (CLS < 0.1). */
export function CatalogSkeleton({ count = 3 }: { readonly count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={styles.card} aria-hidden="true">
          <Skeleton aspectRatio="4 / 3" />
          <div className={styles.body}>
            <Skeleton height="1.5rem" width="70%" />
            <Skeleton height="3.5rem" />
            <Skeleton height="2rem" width="40%" />
            <Skeleton height="2.75rem" />
          </div>
        </div>
      ))}
    </>
  );
}
