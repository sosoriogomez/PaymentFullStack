import { Link, Outlet, ScrollRestoration } from 'react-router';
import { es } from '@/shared/i18n/es';
import styles from './App.module.css';

/** Layout shared by every route: skip link, header, main landmark and sandbox notice. */
export function AppLayout() {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        {es.app.skipToContent}
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} to="/">
          <svg className={styles.logo} viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" />
            <path d="M8 12h16l-1.6 11.2A2 2 0 0 1 20.4 25h-8.8a2 2 0 0 1-2-1.8L8 12Zm4 0a4 4 0 0 1 8 0" />
          </svg>
          {es.app.brand}
        </Link>
      </header>
      <main className={styles.main} id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className={styles.footer}>{es.app.sandboxNotice}</footer>
      {/* New pages start at the top (e.g. the status page after paying from a scrolled catalog). */}
      <ScrollRestoration />
    </div>
  );
}
