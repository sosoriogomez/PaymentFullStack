import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Backdrop } from './Backdrop';

describe('Backdrop', () => {
  const renderBackdrop = (open: boolean, onEscape?: () => void) =>
    render(
      <Backdrop
        open={open}
        title="Resumen del pago"
        backLayer={<p>Audífonos × 1</p>}
        headerAction={<button type="button">Editar</button>}
        footer={<button type="button">Pagar $163.000</button>}
        {...(onEscape ? { onEscape } : {})}
      >
        <p>Total</p>
      </Backdrop>,
    );

  it('should render nothing while closed', () => {
    renderBackdrop(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should show the context on the back layer and the summary on the front layer', () => {
    renderBackdrop(true);

    const dialog = screen.getByRole('dialog', { name: 'Resumen del pago' });
    expect(dialog).toHaveTextContent('Audífonos × 1');
    expect(dialog).toHaveTextContent('Total');
    expect(screen.getByRole('button', { name: 'Pagar $163.000' })).toBeInTheDocument();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('should notify Escape presses', async () => {
    const onEscape = jest.fn();
    renderBackdrop(true, onEscape);

    await userEvent.keyboard('{Escape}');

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('should ignore Escape when there is no handler', async () => {
    renderBackdrop(true);

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
