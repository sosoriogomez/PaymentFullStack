import { type Transaction } from '@/shared/api/contracts';
import { es } from '@/shared/i18n/es';
import { Spinner } from '@/shared/ui/Spinner';
import { type PollingState } from '../transaction.slice';
import styles from './TransactionStatus.module.css';

type Tone = 'pending' | 'success' | 'failure';

const TONES: Record<Transaction['status'], Tone> = {
  PENDING: 'pending',
  APPROVED: 'success',
  DECLINED: 'failure',
  VOIDED: 'failure',
  ERROR: 'failure',
};

const ICON_PATHS: Record<Exclude<Tone, 'pending'>, string> = {
  success: 'M5 12.5l4.5 4.5L19 7.5',
  failure: 'M7 7l10 10M17 7L7 17',
};

export interface StatusHeaderProps {
  readonly status: Transaction['status'];
  readonly polling: PollingState;
}

/** Icon, title and explanation of each status; the live region announces the change. */
export function StatusHeader({ status, polling }: StatusHeaderProps) {
  const tone = TONES[status];
  const copy =
    status === 'PENDING' && polling === 'timeout' ? es.status.TIMEOUT : es.status[status];
  return (
    <header className={`${styles.header} ${styles[tone]}`} aria-live="polite">
      {tone === 'pending' ? (
        <Spinner label={copy.title} />
      ) : (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d={ICON_PATHS[tone]} />
        </svg>
      )}
      <h1 className={styles.title}>{copy.title}</h1>
      <p className={styles.text}>{copy.text}</p>
    </header>
  );
}
