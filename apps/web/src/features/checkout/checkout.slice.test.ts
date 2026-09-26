import { checkoutReset } from './checkout.actions';
import {
  checkoutSlice,
  checkoutStarted,
  contactDraftUpdated,
  deliveryDraftUpdated,
  initialCheckoutState,
  paymentFormClosed,
  summaryEditRequested,
} from './checkout.slice';

const reduce = checkoutSlice.reducer;

describe('checkout reducer', () => {
  it('should start on the product step without sensitive data', () => {
    const state = reduce(undefined, { type: 'unknown' });

    expect(state).toEqual(initialCheckoutState);
    expect(state.cardToken).toBeNull();
    expect(state.idempotencyKey).toBeNull();
  });

  it('should open the payment form for the chosen product and quantity', () => {
    const state = reduce(initialCheckoutState, checkoutStarted({ productId: 'p1', quantity: 2 }));

    expect(state).toMatchObject({ step: 'PAYMENT_FORM', productId: 'p1', quantity: 2 });
  });

  it('should keep the drafts when the payment form is closed', () => {
    const withDraft = reduce(
      reduce(initialCheckoutState, checkoutStarted({ productId: 'p1', quantity: 1 })),
      contactDraftUpdated({ fullName: 'Ana Pérez' }),
    );

    const closed = reduce(withDraft, paymentFormClosed());

    expect(closed.step).toBe('PRODUCT');
    expect(closed.contact.fullName).toBe('Ana Pérez');
  });

  it('should merge partial draft updates', () => {
    const state = reduce(
      reduce(initialCheckoutState, deliveryDraftUpdated({ city: 'Medellín' })),
      deliveryDraftUpdated({ region: 'Antioquia' }),
    );

    expect(state.delivery).toMatchObject({
      city: 'Medellín',
      region: 'Antioquia',
      addressLine1: '',
    });
  });

  it('should go back to the form when the summary is edited', () => {
    const summary = { ...initialCheckoutState, step: 'SUMMARY' as const };

    expect(reduce(summary, summaryEditRequested()).step).toBe('PAYMENT_FORM');
  });

  it('should forget everything on reset', () => {
    const busy = {
      ...initialCheckoutState,
      step: 'RESULT' as const,
      cardToken: 'tok',
      idempotencyKey: 'key',
    };

    expect(reduce(busy, checkoutReset())).toEqual(initialCheckoutState);
  });
});
