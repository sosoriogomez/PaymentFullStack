import { useFormContext } from 'react-hook-form';
import { es } from '@/shared/i18n/es';
import { Select } from '@/shared/ui/Select';
import { TextField } from '@/shared/ui/TextField';
import { type DeliveryFormValues } from '../domain/payment-form-schema';
import { COLOMBIAN_REGIONS } from '../domain/regions';
import styles from './CheckoutForm.module.css';

const texts = es.checkout.delivery;
const REGION_OPTIONS = COLOMBIAN_REGIONS.map((region) => ({ value: region, label: region }));

/** Contact and delivery data: the only part of the form saved as a draft (never the card). */
export function DeliveryFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<DeliveryFormValues>();

  return (
    <fieldset className={styles.section}>
      <legend className={styles.legend}>{texts.legend}</legend>
      <TextField
        label={texts.fullName}
        autoComplete="name"
        {...register('fullName')}
        error={errors.fullName?.message}
      />
      <TextField
        label={texts.email}
        type="email"
        inputMode="email"
        autoComplete="email"
        {...register('email')}
        error={errors.email?.message}
      />
      <TextField
        label={texts.phone}
        hint={texts.phoneHint}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        {...register('phone')}
        error={errors.phone?.message}
      />
      <TextField
        label={texts.addressLine1}
        placeholder={texts.addressLine1Placeholder}
        autoComplete="address-line1"
        {...register('addressLine1')}
        error={errors.addressLine1?.message}
      />
      <TextField
        label={texts.addressLine2}
        autoComplete="address-line2"
        {...register('addressLine2')}
        error={errors.addressLine2?.message}
      />
      <div className={`${styles.row} ${styles.wideRow}`}>
        <Select
          label={texts.region}
          placeholder={texts.regionPlaceholder}
          options={REGION_OPTIONS}
          autoComplete="address-level1"
          {...register('region')}
          error={errors.region?.message}
        />
        <TextField
          label={texts.city}
          autoComplete="address-level2"
          {...register('city')}
          error={errors.city?.message}
        />
      </div>
      <TextField
        label={texts.postalCode}
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        {...register('postalCode')}
        error={errors.postalCode?.message}
      />
    </fieldset>
  );
}
