import { screen } from '@testing-library/react';
import { renderRoute } from '@test/support/render-route';
import { es } from '@/shared/i18n/es';

describe('AppLayout', () => {
  it('should render the store shell with its landmarks and a skip link', async () => {
    renderRoute('/');

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: es.app.skipToContent })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/sandbox/i);
    expect(
      await screen.findByRole('heading', { level: 1, name: es.catalog.title }),
    ).toBeInTheDocument();
  });

  it('should show a not found page for unknown routes', () => {
    renderRoute('/does-not-exist');

    expect(screen.getByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a la tienda' })).toHaveAttribute('href', '/');
  });
});
