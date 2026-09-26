import { type AppThunk } from '@/app/hooks';
import { type CardInput } from '@/shared/api/ports';
import { AsyncResult, map } from '@/shared/lib/result';
import { toUiError } from '@/shared/lib/ui-error';
import {
  type ContactDraft,
  type DeliveryDraft,
  paymentFormAccepted,
  paymentFormFailed,
  paymentFormSubmitted,
} from './checkout.slice';
import { onlyDigits } from './domain/card-number';
import { type PaymentFormValues } from './domain/payment-form-schema';

const toCardInput = (values: PaymentFormValues): CardInput => {
  const [expMonth = '', expYear = ''] = values.expiry.split('/');
  return {
    number: onlyDigits(values.number),
    cvc: values.cvc,
    expMonth,
    expYear,
    holderName: values.holderName.trim().replace(/\s+/g, ' '),
  };
};

const toContact = (values: PaymentFormValues): ContactDraft => ({
  fullName: values.fullName,
  email: values.email,
  phone: values.phone,
});

const toDelivery = (values: PaymentFormValues): DeliveryDraft => ({
  addressLine1: values.addressLine1,
  addressLine2: values.addressLine2,
  city: values.city,
  region: values.region,
  postalCode: values.postalCode,
});

/**
 * "Continuar" (spec FE-06): tokenize the card with the gateway → register the customer → quote
 * the order → SUMMARY. Written by hand instead of createAsyncThunk on purpose: its argument would
 * travel in `meta.arg` of every action, and card data must never enter Redux (ADR-002).
 */
export const submitPaymentForm =
  (values: PaymentFormValues): AppThunk<Promise<void>> =>
  async (dispatch, getState, { cardTokenizer, api, idGenerator }) => {
    const { productId, quantity, submission, idempotencyKey } = getState().checkout;
    if (!productId || submission.status === 'pending') return;
    dispatch(paymentFormSubmitted());

    const result = await AsyncResult.from(cardTokenizer.tokenize(toCardInput(values)))
      .andThen(async (card) =>
        map(await api.registerCustomer(toContact(values)), (customer) => ({ card, customer })),
      )
      .andThen(async (context) =>
        map(await api.getQuote({ productId, quantity }), (quote) => ({ ...context, quote })),
      );

    if (!result.ok) {
      dispatch(paymentFormFailed(toUiError(result.error)));
      return;
    }
    const { card, customer, quote } = result.value;
    dispatch(
      paymentFormAccepted({
        card: {
          brand: card.brand,
          lastFour: card.lastFour,
          holderName: toCardInput(values).holderName,
        },
        cardToken: card.token,
        cardTokenExpiresAt: card.expiresAt,
        customerId: customer.id,
        quote: quote.amounts,
        installments: values.installments,
        contact: toContact(values),
        delivery: toDelivery(values),
        // One key per purchase attempt: kept when the card is entered again (C-04, ADR-006).
        idempotencyKey: idempotencyKey ?? idGenerator.uuid(),
      }),
    );
  };
