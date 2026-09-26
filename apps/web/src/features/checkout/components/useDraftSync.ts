import { useEffect } from 'react';
import { type Control, useWatch } from 'react-hook-form';
import { useAppDispatch } from '@/app/hooks';
import { contactDraftUpdated, deliveryDraftUpdated } from '../checkout.slice';
import {
  DRAFT_FIELDS,
  type DeliveryFormValues,
  type PaymentFormValues,
} from '../domain/payment-form-schema';

export const DRAFT_DEBOUNCE_MS = 300;

type Draft = Pick<DeliveryFormValues, (typeof DRAFT_FIELDS)[number]>;

const toDraft = (values: readonly (string | undefined)[]): Draft =>
  Object.fromEntries(DRAFT_FIELDS.map((field, index) => [field, values[index] ?? ''])) as Draft;

/**
 * Mirrors contact and delivery fields to Redux (debounced) so a refresh can restore them (FE-09).
 * Only DRAFT_FIELDS are watched: card fields never leave react-hook-form.
 */
export function useDraftSync(control: Control<PaymentFormValues>) {
  const dispatch = useAppDispatch();
  const values = useWatch({ control, name: DRAFT_FIELDS });
  const snapshot = JSON.stringify(toDraft(values));

  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = JSON.parse(snapshot) as Draft;
      dispatch(
        contactDraftUpdated({ fullName: draft.fullName, email: draft.email, phone: draft.phone }),
      );
      dispatch(
        deliveryDraftUpdated({
          addressLine1: draft.addressLine1,
          addressLine2: draft.addressLine2,
          region: draft.region,
          city: draft.city,
          postalCode: draft.postalCode,
        }),
      );
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [dispatch, snapshot]);
}
