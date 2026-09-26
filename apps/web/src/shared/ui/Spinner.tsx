import styles from './Feedback.module.css';

export interface SpinnerProps {
  /** Announced to screen readers and shown next to the spinner. */
  readonly label: string;
  readonly showLabel?: boolean;
}

export function Spinner({ label, showLabel = false }: SpinnerProps) {
  return (
    <span className={styles.spinner} role="status" aria-live="polite">
      <span className={styles.spinnerMark} aria-hidden="true" />
      <span className={showLabel ? undefined : 'visuallyHidden'}>{label}</span>
    </span>
  );
}
