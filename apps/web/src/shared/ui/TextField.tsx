import { type InputHTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import styles from './Field.module.css';
import { describedBy } from './field-ids';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  /** Decoration at the end of the input (e.g. the card brand logo). */
  readonly suffix?: ReactNode;
  readonly ref?: Ref<HTMLInputElement>;
}

/** Labelled input; errors are linked with aria-describedby and flagged with aria-invalid. */
export function TextField({
  label,
  hint,
  error,
  suffix,
  id,
  className,
  ref,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const { hintId, errorId, ariaDescribedBy } = describedBy(inputId, hint, error);
  const inputClass = [styles.input, suffix ? styles.withSuffix : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          className={inputClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={ariaDescribedBy}
        />
        {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
      </div>
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
