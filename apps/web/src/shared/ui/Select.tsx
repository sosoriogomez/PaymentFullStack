import { type Ref, type SelectHTMLAttributes, useId } from 'react';
import styles from './Field.module.css';
import { describedBy } from './field-ids';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLSelectElement>;
}

export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  id,
  ref,
  ...selectProps
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const { hintId, errorId, ariaDescribedBy } = describedBy(selectId, hint, error);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        {...selectProps}
        ref={ref}
        id={selectId}
        className={`${styles.input} ${styles.select}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={ariaDescribedBy}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
