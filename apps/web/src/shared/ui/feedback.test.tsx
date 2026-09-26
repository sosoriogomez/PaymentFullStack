import { render, screen } from '@testing-library/react';
import { Alert } from './Alert';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';

describe('Alert', () => {
  it('should interrupt screen readers only for errors', () => {
    render(
      <>
        <Alert tone="error">Pago rechazado</Alert>
        <Alert>Vuelve a ingresar tu tarjeta</Alert>
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Pago rechazado');
    expect(screen.getByRole('status')).toHaveTextContent('Vuelve a ingresar tu tarjeta');
  });
});

describe('Spinner', () => {
  it('should announce its label, visually hidden by default', () => {
    const { rerender } = render(<Spinner label="Procesando pago" />);

    expect(screen.getByRole('status')).toHaveTextContent('Procesando pago');
    expect(screen.getByText('Procesando pago')).toHaveClass('visuallyHidden');

    rerender(<Spinner label="Procesando pago" showLabel />);
    expect(screen.getByText('Procesando pago')).not.toHaveClass('visuallyHidden');
  });
});

describe('Skeleton', () => {
  it('should be hidden from assistive technology and keep the final size', () => {
    const { container } = render(<Skeleton aspectRatio="4 / 3" height="1rem" className="card" />);

    const skeleton = container.firstElementChild as HTMLElement;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton).toHaveClass('card');
    expect(skeleton.style.aspectRatio).toBe('4 / 3');
  });
});
