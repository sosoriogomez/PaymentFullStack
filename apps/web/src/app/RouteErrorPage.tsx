import { es } from '@/shared/i18n/es';
import { Button } from '@/shared/ui/Button';
import styles from './MessagePage.module.css';

export interface RouteErrorPageProps {
  readonly reload?: () => void;
}

const reloadPage = () => {
  window.location.reload();
};

/**
 * Shown inside the layout when a page cannot render, e.g. a deferred chunk that failed to
 * download. Reloading fetches the current index.html and its chunks again.
 */
export function RouteErrorPage({ reload = reloadPage }: RouteErrorPageProps) {
  return (
    <section className={styles.page} aria-labelledby="route-error-title">
      <h1 id="route-error-title" className={styles.title}>
        {es.app.failure.title}
      </h1>
      <p className={styles.text}>{es.app.failure.text}</p>
      <Button onClick={reload}>{es.app.failure.reload}</Button>
    </section>
  );
}
