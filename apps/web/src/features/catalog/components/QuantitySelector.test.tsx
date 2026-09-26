import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuantitySelector } from './QuantitySelector';

describe('QuantitySelector', () => {
  const setup = (value: number, max: number, disabled = false) => {
    const onChange = jest.fn();
    render(<QuantitySelector value={value} max={max} onChange={onChange} disabled={disabled} />);
    return {
      onChange,
      less: screen.getByRole('button', { name: 'Disminuir cantidad' }),
      more: screen.getByRole('button', { name: 'Aumentar cantidad' }),
    };
  };

  it('should be a labelled group that shows the current value', () => {
    setup(2, 5);

    expect(screen.getByRole('group', { name: 'Cantidad' })).toHaveTextContent('2');
  });

  it('should step up and down', async () => {
    const { onChange, less, more } = setup(2, 5);

    await userEvent.click(more);
    await userEvent.click(less);

    expect(onChange).toHaveBeenNthCalledWith(1, 3);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it('should not go below 1 or above the maximum', () => {
    expect(setup(1, 1).less).toBeDisabled();
  });

  it('should disable both buttons at the maximum when stock is 1', () => {
    const { more } = setup(1, 1);

    expect(more).toBeDisabled();
  });

  it('should be fully disabled when requested', () => {
    const { less, more } = setup(2, 5, true);

    expect(less).toBeDisabled();
    expect(more).toBeDisabled();
  });
});
