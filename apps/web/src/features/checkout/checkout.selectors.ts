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
