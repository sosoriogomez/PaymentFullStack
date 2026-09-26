import { type ChangeEvent } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { es } from '@/shared/i18n/es';
import { Alert } from '@/shared/ui/Alert';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { MAX_INSTALLMENTS } from '../checkout.slice';
import { formatExpiry } from '../domain/card-details';
import { type CardFormValues } from '../domain/card-schema';
import { caretAfterDigits, detectBrand, formatCardNumber, onlyDigits } from '../domain/card-number';
import { CardBrandLogo } from './CardBrandLogo';
import styles from './CheckoutForm.module.css';

const texts = es.checkout.card;

const INSTALLMENT_OPTIONS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => ({
  value: String(index + 1),
  label: texts.installment(index + 1),
}));

/** Reformats the number keeping the caret after the same digit (editing in the middle works). */
const onCardNumberChange = (
  event: ChangeEvent<HTMLInputElement>,
  onChange: (v: string) => void,
) => {
  const input = event.target;
  const digitsBeforeCaret = onlyDigits(
    input.value.slice(0, input.selectionStart ?? undefined),
  ).length;
  const formatted = formatCardNumber(input.value);
  onChange(formatted);
  requestAnimationFrame(() => {
    const caret = caretAfterDigits(formatted, digitsBeforeCaret);
    input.setSelectionRange(caret, caret);
  });
};

export interface CardFieldsProps {
  /** After a refresh the token is gone: explain why the card must be entered again. */
  readonly reentryRequired?: boolean;
}

/**
 * Card section of the payment form. The number, expiry and CVC only live in react-hook-form and
 * go straight to the gateway tokenization (ADR-002): never to Redux, storage or our API.
 */
export function CardFields({ reentryRequired = false }: CardFieldsProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<CardFormValues>();
  const number = useWatch({ control, name: 'number' });

  return (
    <fieldset className={styles.section}>
      <legend className={styles.legend}>{texts.legend}</legend>
      {reentryRequired ? <Alert tone="info">{texts.reentry}</Alert> : null}
      <Controller
        control={control}
        name="number"
        render={({ field }) => (
          <TextField
            label={texts.number}
            hint={texts.supportedBrands}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            ref={field.ref}
            name={field.name}
            value={field.value}
            onBlur={field.onBlur}
            onChange={(event) => {
              onCardNumberChange(event, field.onChange);
            }}
            error={errors.number?.message}
            suffix={<CardBrandLogo brand={detectBrand(onlyDigits(number))} />}
          />
        )}
      />
      <TextField
        label={texts.holderName}
        autoComplete="cc-name"
        autoCapitalize="characters"
        {...register('holderName')}
        error={errors.holderName?.message}
      />
      <div className={styles.row}>
        <Controller
          control={control}
          name="expiry"
          render={({ field }) => (
            <TextField
              label={texts.expiry}
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder={texts.expiryPlaceholder}
              ref={field.ref}
              name={field.name}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(event) => {
                field.onChange(formatExpiry(event.target.value));
              }}
              error={errors.expiry?.message}
            />
          )}
        />
        <TextField
          label={texts.cvc}
          hint={texts.cvcHint}
          inputMode="numeric"
          autoComplete="cc-csc"
          maxLength={3}
          {...register('cvc')}
          error={errors.cvc?.message}
        />
      </div>
      <Select
        label={texts.installments}
        options={INSTALLMENT_OPTIONS}
        {...register('installments', { valueAsNumber: true })}
      />
    </fieldset>
  );
}
