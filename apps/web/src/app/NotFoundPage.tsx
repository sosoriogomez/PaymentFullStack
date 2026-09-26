import { Link } from 'react-router';
import { es } from '@/shared/i18n/es';
import styles from './MessagePage.module.css';

export function NotFoundPage() {
  return (
    <section className={styles.page} aria-labelledby="not-found-title">
      <h1 id="not-found-title" className={styles.title}>
        {es.app.notFound.title}
      </h1>
      <Link to="/">{es.app.notFound.back}</Link>
    </section>
  );
}
