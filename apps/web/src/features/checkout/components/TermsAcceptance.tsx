import { type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { type Acceptance } from '@/shared/api/contracts';
import { es } from '@/shared/i18n/es';
import { type LoadStatus } from '@/shared/lib/load-status';
import { Alert } from '@/shared/ui/Alert';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { Spinner } from '@/shared/ui/Spinner';
import { type PaymentFormValues } from '../domain/payment-form-schema';
import styles from './CheckoutForm.module.css';

const texts = es.checkout.terms;

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visuallyHidden"> {texts.opensInNewTab}</span>
    </a>
  );
}

export interface TermsAcceptanceProps {
  readonly acceptance: Acceptance | null;
  readonly status: LoadStatus;
  readonly onRetry: () => void;
}

/** Explicit acceptance of both gateway contracts, with links to read them (required to pay). */
export function TermsAcceptance({ acceptance, status, onRetry }: TermsAcceptanceProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<PaymentFormValues>();

  return (
    <fieldset className={styles.section}>
      <legend className={styles.legend}>{texts.legend}</legend>
      {status === 'failed' ? (
        <div className={styles.feedback}>
          <Alert tone="error">{texts.loadError}</Alert>
          <Button variant="secondary" onClick={onRetry}>
            {texts.retry}
          </Button>
        </div>
      ) : null}
      {!acceptance && status !== 'failed' ? <Spinner label={texts.loading} showLabel /> : null}
      {acceptance ? (
        <>
          <Checkbox
            {...register('acceptTerms')}
            error={errors.acceptTerms?.message}
            label={
              <>
                {texts.acceptPrefix}{' '}
                <ExternalLink href={acceptance.acceptancePermalink}>
                  {texts.acceptLink}
                </ExternalLink>
              </>
            }
          />
          <Checkbox
            {...register('acceptPersonalData')}
            error={errors.acceptPersonalData?.message}
            label={
              <>
                {texts.personalDataPrefix}{' '}
                <ExternalLink href={acceptance.personalDataAuthPermalink}>
                  {texts.personalDataLink}
                </ExternalLink>
              </>
            }
          />
        </>
      ) : null}
    </fieldset>
  );
}
