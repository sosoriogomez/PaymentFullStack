import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Modal, type ModalProps } from './Modal';

function Harness(props: Partial<ModalProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Pagar con tarjeta de crédito
      </button>
      <Modal
        open={open}
        title="Datos de pago"
        onClose={() => {
          setOpen(false);
        }}
        footer={<button type="button">Continuar</button>}
        {...props}
      >
        <label>
          Número <input />
        </label>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('should render nothing while closed', () => {
    render(<Harness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should open as a labelled modal dialog and move focus inside', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /pagar/i }));

    const dialog = screen.getByRole('dialog', { name: 'Datos de pago' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('should close with Escape and give the focus back to the trigger', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /pagar/i });

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('should close with its close button', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /pagar/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should keep the focus inside with Tab and Shift+Tab', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /pagar/i }));
    const close = screen.getByRole('button', { name: 'Cerrar' });
    const cta = screen.getByRole('button', { name: 'Continuar' });

    cta.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(cta).toHaveFocus();
  });

  it('should not be dismissible while an operation is in progress', async () => {
    render(<Harness dismissible={false} />);

    await userEvent.click(screen.getByRole('button', { name: /pagar/i }));
    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
  });

  it('should make the page behind inert and block its scroll until closed', async () => {
    const { container } = render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /pagar/i }));
    expect(container).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    expect(container).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('should honor an initial focus target', () => {
    function WithInitialFocus() {
      const [ref] = useState(() => ({ current: null as HTMLInputElement | null }));
      return (
        <Modal open title="Pago" onClose={jest.fn()} initialFocusRef={ref}>
          <button type="button">Primero</button>
          <input aria-label="Objetivo" ref={ref} />
        </Modal>
      );
    }
    render(<WithInitialFocus />);

    expect(screen.getByLabelText('Objetivo')).toHaveFocus();
  });
});
