import { es } from '@/shared/i18n/es';
import { useCountdown } from '@/shared/hooks/useCountdown';
import { Button } from '@/shared/ui/Button';
import styles from './TransactionStatus.module.css';

export const AUTO_REDIRECT_SECONDS = 10;
const texts = es.status;

export interface StatusActionsProps {
  readonly final: boolean;
  readonly failed: boolean;
  readonly onBackToStore: () => void;
  readonly onTryAnotherCard: () => void;
}

/** Back to the store (automatic after 10 s once final, cancelable) and retry after a failure. */
export function StatusActions({
  final,
  failed,
  onBackToStore,
  onTryAnotherCard,
}: StatusActionsProps) {
  const countdown = useCountdown(AUTO_REDIRECT_SECONDS, final, onBackToStore);
  return (
    <div className={styles.actions}>
      {failed ? (
        <Button fullWidth onClick={onTryAnotherCard}>
          {texts.tryAnotherCard}
        </Button>
      ) : null}
      <Button fullWidth variant={failed ? 'secondary' : 'primary'} onClick={onBackToStore}>
        {texts.backToStore}
      </Button>
      {countdown.running ? (
        <p className={styles.countdown} role="timer" aria-live="off">
          {texts.redirect(countdown.remaining)}{' '}
          <Button variant="ghost" onClick={countdown.cancel}>
            {texts.stay}
          </Button>
        </p>
      ) : null}
    </div>
  );
}
