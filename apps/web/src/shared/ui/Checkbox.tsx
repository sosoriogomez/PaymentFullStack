import { type InputHTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import styles from './Field.module.css';
import { describedBy } from './field-ids';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label: ReactNode;
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLInputElement>;
}

export function Checkbox({ label, error, id, ref, ...inputProps }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const { errorId, ariaDescribedBy } = describedBy(inputId, undefined, error);

  return (
    <div className={styles.field}>
      <div className={styles.checkbox}>
        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          type="checkbox"
          className={styles.checkboxInput}
          aria-invalid={error ? true : undefined}
          aria-describedby={ariaDescribedBy}
        />
        <label htmlFor={inputId}>{label}</label>
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
