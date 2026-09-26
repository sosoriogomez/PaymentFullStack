import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { es } from '@/shared/i18n/es';
import { RouteErrorPage } from './RouteErrorPage';

function Broken(): never {
  throw new Error('chunk failed to load');
}

describe('RouteErrorPage', () => {
  it('should replace a page that cannot render and offer to reload', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = jest.fn();
    const router = createMemoryRouter([
      { path: '/', element: <Broken />, errorElement: <RouteErrorPage reload={reload} /> },
    ]);
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: es.app.failure.title })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: es.app.failure.reload }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
