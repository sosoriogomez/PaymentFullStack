import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <a className={styles.brand} href="/">
          Tienda
        </a>
      </header>
      <main className={styles.main} id="main-content">
        <h1>Productos</h1>
      </main>
      <footer className={styles.footer}>
        Pagos procesados en modo sandbox: no se cobra dinero real.
      </footer>
    </div>
  );
}
