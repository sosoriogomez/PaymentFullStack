import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';
import { Select } from './Select';
import { TextField } from './TextField';

describe('TextField', () => {
  it('should be labelled and describe its hint', () => {
    render(<TextField label="Número de tarjeta" hint="16 dígitos" />);

    const input = screen.getByLabelText('Número de tarjeta');
    expect(input).toHaveAccessibleDescription('16 dígitos');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('should flag and describe errors', () => {
    render(<TextField label="CVC" error="El CVC tiene 3 dígitos" />);

    const input = screen.getByLabelText('CVC');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('El CVC tiene 3 dígitos');
  });

  it('should render a suffix and forward the ref and input props', async () => {
    const ref = { current: null as HTMLInputElement | null };
    render(
      <TextField
        label="Titular"
        suffix={<span>VISA</span>}
        ref={ref}
        id="holder"
        inputMode="text"
      />,
    );

    await userEvent.type(screen.getByLabelText('Titular'), 'ANA');

    expect(screen.getByText('VISA')).toBeInTheDocument();
    expect(ref.current?.value).toBe('ANA');
    expect(ref.current?.id).toBe('holder');
  });
});

describe('Select', () => {
  const options = [
    { value: 'ANT', label: 'Antioquia' },
    { value: 'VAC', label: 'Valle del Cauca' },
  ];

  it('should list the options after the placeholder and report the selection', async () => {
    const onChange = jest.fn();
    render(
      <Select label="Departamento" options={options} placeholder="Elige uno" onChange={onChange} />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'VAC');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Elige uno',
      'Antioquia',
      'Valle del Cauca',
    ]);
    expect(onChange).toHaveBeenCalled();
  });

  it('should flag errors and describe hints', () => {
    render(
      <Select label="Cuotas" options={options} hint="Sin intereses" error="Elige una opción" />,
    );

    const select = screen.getByLabelText('Cuotas');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Sin intereses Elige una opción');
  });
});

describe('Checkbox', () => {
  it('should toggle through its label', async () => {
    render(<Checkbox label="Acepto los términos" />);

    await userEvent.click(screen.getByText('Acepto los términos'));

    expect(screen.getByRole('checkbox', { name: 'Acepto los términos' })).toBeChecked();
  });

  it('should flag errors', () => {
    render(<Checkbox label="Acepto" error="Debes aceptar" />);

    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription('Debes aceptar');
  });
});
