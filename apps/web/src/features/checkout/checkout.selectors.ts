import { createSelector } from '@reduxjs/toolkit';
import { type RootState } from '@/app/hooks';
import { selectProducts } from '@/features/catalog/catalog.selectors';

export const selectCheckout = (state: RootState) => state.checkout;
export const selectCheckoutStep = (state: RootState) => state.checkout.step;
export const selectSubmission = (state: RootState) => state.checkout.submission;

export const selectAcceptance = createSelector([selectCheckout], (checkout) => ({
  acceptance: checkout.acceptance,
  status: checkout.acceptanceStatus,
}));

/** Draft shown when the payment form opens (contact + delivery, never card data). */
export const selectDeliveryDefaults = createSelector([selectCheckout], (checkout) => ({
  ...checkout.contact,
  ...checkout.delivery,
}));

export const selectCheckoutProduct = createSelector(
  [selectProducts, (state: RootState) => state.checkout.productId],
  (products, productId) => products.find((product) => product.id === productId) ?? null,
);

export interface OrderSummary {
  readonly productName: string;
  readonly imageKey: string;
  readonly quantity: number;
  readonly amounts: NonNullable<RootState['checkout']['quote']>;
  readonly card: NonNullable<RootState['checkout']['card']>;
  readonly installments: number;
  readonly recipient: string;
  readonly address: string;
}

/** Step 3 breakdown. The total comes from the API quote: the front never computes what is charged. */
export const selectOrderSummary = createSelector(
  [selectCheckout, selectCheckoutProduct],
  (checkout, product): OrderSummary | null => {
    const { quote, card, contact, delivery } = checkout;
    if (!quote || !card || !product) return null;
    return {
      productName: product.name,
      imageKey: product.imageKey,
      quantity: checkout.quantity,
      amounts: quote,
      card,
      installments: checkout.installments,
      recipient: contact.fullName,
      address: [delivery.addressLine1, delivery.addressLine2, delivery.city, delivery.region]
        .filter((part) => part.trim() !== '')
        .join(', '),
    };
  },
);

/** Why the checkout went back to the product (e.g. the stock ran out while paying). */
export const selectProductNotice = (state: RootState) =>
  state.checkout.step === 'PRODUCT' && state.checkout.submission.status === 'failed'
    ? state.checkout.submission.error
    : null;
