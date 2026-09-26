import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { es } from '@/shared/i18n/es';
import { type CardFormValues, createCardSchema, emptyCard } from '../domain/card-schema';
import { CardFields } from './CardFields';

const NOW = new Date(2026, 9, 15).getTime();
const texts = es.checkout.card;

function Harness({
  onValid,
  reentryRequired,
}: {
  onValid: (values: CardFormValues) => void;
  reentryRequired?: boolean;
}) {
  const form = useForm<CardFormValues>({
    resolver: zodResolver(createCardSchema(() => NOW)),
    mode: 'onTouched',
    defaultValues: emptyCard,
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={(event) => void form.handleSubmit(onValid)(event)}>
        <CardFields reentryRequired={reentryRequired ?? false} />
        <button type="submit">{es.checkout.continue}</button>
      </form>
    </FormProvider>
  );
}

const setup = (reentryRequired = false) => {
  const onValid = jest.fn();
  const user = userEvent.setup();
  render(<Harness onValid={onValid} reentryRequired={reentryRequired} />);
  const field = (label: string) => screen.getByLabelText(label);
  return { user, onValid, field };
};

describe('CardFields', () => {
  it.each([
    ['4242424242424242', 'Visa'],
    ['5555555555554444', 'MasterCard'],
    ['2221000000000009', 'MasterCard'],
  ])('should show the brand of %s while typing', async (number, brand) => {
    const { user, field } = setup();

    await user.type(field(texts.number), number);

    expect(screen.getByRole('img', { name: brand })).toBeInTheDocument();
  });

  it('should format the number in groups of four and the expiry as MM/AA', async () => {
    const { user, field } = setup();

    await user.type(field(texts.number), '4242424242424242');
    await user.type(field(texts.expiry), '1229');

    expect(field(texts.number)).toHaveValue('4242 4242 4242 4242');
    expect(field(texts.expiry)).toHaveValue('12/29');
  });

  it('should keep the caret in place when editing in the middle of the number', async () => {
    const { user, field } = setup();
    const input = field(texts.number) as HTMLInputElement;
    await user.type(input, '42424242');

    input.setSelectionRange(2, 2);
    await user.keyboard('9');
    await new Promise(requestAnimationFrame);

    expect(input).toHaveValue('4294 2424 2');
    expect(input.selectionStart).toBe(3);
  });

  it('should reject unsupported brands on blur', async () => {
    const { user, field } = setup();

    await user.type(field(texts.number), '378282246310005');
    await user.tab();

    expect(field(texts.number)).toHaveAccessibleDescription(
      expect.stringContaining(texts.errors.unsupportedBrand),
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('should flag an invalid number and an expired date when leaving the fields', async () => {
    const { user, field } = setup();

    await user.type(field(texts.number), '4242424242424241');
    await user.type(field(texts.expiry), '0926');
    await user.tab();

    expect(field(texts.number)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(texts.errors.numberInvalid)).toBeInTheDocument();
    expect(screen.getByText(texts.errors.expiryInvalid)).toBeInTheDocument();
  });

  it('should show every error on submit and not submit', async () => {
    const { user, onValid } = setup();

    await user.click(screen.getByRole('button', { name: es.checkout.continue }));

    expect(await screen.findByText(texts.errors.numberRequired)).toBeInTheDocument();
    expect(screen.getByText(texts.errors.holderName)).toBeInTheDocument();
    expect(screen.getByText(texts.errors.expiryIncomplete)).toBeInTheDocument();
    expect(screen.getByText(texts.errors.cvc)).toBeInTheDocument();
    expect(onValid).not.toHaveBeenCalled();
  });

  it('should submit a valid card with the chosen installments', async () => {
    const { user, field, onValid } = setup();

    await user.type(field(texts.number), '4242424242424242');
    await user.type(field(texts.holderName), 'Ana Pérez');
    await user.type(field(texts.expiry), '1229');
    await user.type(field(texts.cvc), '123');
    await user.selectOptions(field(texts.installments), '12');
    await user.click(screen.getByRole('button', { name: es.checkout.continue }));

    expect(onValid).toHaveBeenCalledWith(
      {
        number: '4242 4242 4242 4242',
        holderName: 'Ana Pérez',
        expiry: '12/29',
        cvc: '123',
        installments: 12,
      },
      expect.anything(),
    );
  });

  it('should explain why the card must be entered again after a refresh', () => {
    setup(true);

    expect(screen.getByRole('status')).toHaveTextContent(texts.reentry);
  });

  it('should use the autofill and numeric keyboard hints of card fields', () => {
    const { field } = setup();

    expect(field(texts.number)).toHaveAttribute('autocomplete', 'cc-number');
    expect(field(texts.number)).toHaveAttribute('inputmode', 'numeric');
    expect(field(texts.holderName)).toHaveAttribute('autocomplete', 'cc-name');
    expect(field(texts.expiry)).toHaveAttribute('autocomplete', 'cc-exp');
    expect(field(texts.cvc)).toHaveAttribute('autocomplete', 'cc-csc');
  });
});
