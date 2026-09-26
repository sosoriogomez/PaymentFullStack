import { type ReactNode } from 'react';
import styles from './Feedback.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  readonly tone?: AlertTone;
  readonly children: ReactNode;
}

/** Errors interrupt screen readers (role=alert); other tones are polite status messages. */
export function Alert({ tone = 'info', children }: AlertProps) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className={styles.alertBody}>{children}</div>
    </div>
  );
}
