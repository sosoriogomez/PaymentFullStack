import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title">
      <h1 id="not-found-title">No encontramos esta página</h1>
      <p>
        <Link to="/">Volver a la tienda</Link>
      </p>
    </section>
  );
}
