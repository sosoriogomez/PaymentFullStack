import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('should be a real button that reacts to clicks', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Pagar</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('should be disabled and busy while loading, keeping its accessible name', async () => {
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Pagar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Pagar' });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should accept variants, full width and submit type', () => {
    render(
      <Button variant="secondary" fullWidth type="submit" className="extra">
        Continuar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Continuar' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveClass('secondary', 'fullWidth', 'extra');
    expect(button).not.toHaveAttribute('aria-busy');
  });
});
