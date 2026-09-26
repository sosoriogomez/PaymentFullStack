import { useId } from 'react';
import { es } from '@/shared/i18n/es';
import styles from './QuantitySelector.module.css';

export interface QuantitySelectorProps {
  readonly value: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly disabled?: boolean;
}

/** Stepper limited to 1…max (max = min(stock, 10)); large touch targets for phones. */
export function QuantitySelector({
  value,
  max,
  onChange,
  disabled = false,
}: QuantitySelectorProps) {
  const labelId = useId();
  return (
    <div className={styles.selector} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.label}>
        {es.catalog.quantity}
      </span>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.step}
          aria-label="Disminuir cantidad"
          disabled={disabled || value <= 1}
          onClick={() => {
            onChange(value - 1);
          }}
        >
          −
        </button>
        <output className={styles.value} aria-live="polite">
          {value}
        </output>
        <button
          type="button"
          className={styles.step}
          aria-label="Aumentar cantidad"
          disabled={disabled || value >= max}
          onClick={() => {
            onChange(value + 1);
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
