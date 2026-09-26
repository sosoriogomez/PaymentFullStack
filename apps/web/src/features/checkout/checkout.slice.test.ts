import { ACCEPTANCE, someAmounts } from '@test/builders';
import { aTransaction } from '@test/builders';
import { transactionUpdated } from '@/features/transaction/transaction.slice';
import { checkoutReset, fetchAcceptance, retryWithAnotherCard } from './checkout.actions';
import {
  checkoutSlice,
  checkoutStarted,
  contactDraftUpdated,
  deliveryDraftUpdated,
  initialCheckoutState,
  paymentFormAccepted,
  paymentFormClosed,
  paymentFormFailed,
  paymentFormSubmitted,
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

  describe('payment form submission', () => {
    const accepted = {
      card: { brand: 'VISA', lastFour: '4242', holderName: 'Ana Pérez' },
      cardToken: 'tok_1',
      cardTokenExpiresAt: 1,
      customerId: 'c1',
      quote: someAmounts(),
      installments: 2,
      contact: { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' },
      delivery: {
        addressLine1: 'Cra 43A # 1-50',
        addressLine2: '',
        city: 'Medellín',
        region: 'Antioquia',
        postalCode: '',
      },
      idempotencyKey: 'k1',
    };

    it('should track the request and move to the summary with the accepted data', () => {
      const pending = reduce(initialCheckoutState, paymentFormSubmitted());
      const summary = reduce(
        { ...pending, cardReentryRequired: true },
        paymentFormAccepted(accepted),
      );

      expect(pending.submission.status).toBe('pending');
      expect(summary).toMatchObject({
        ...accepted,
        step: 'SUMMARY',
        cardReentryRequired: false,
        submission: { status: 'idle', error: null },
      });
    });

    it('should keep the form open with the error when it fails', () => {
      const error = { code: 'CARD_REJECTED', message: 'rechazada' };

      expect(reduce(initialCheckoutState, paymentFormFailed(error)).submission).toEqual({
        status: 'failed',
        error,
      });
    });
  });

  describe('acceptance', () => {
    it('should load the acceptance tokens', () => {
      const loading = reduce(initialCheckoutState, { type: fetchAcceptance.pending.type });
      const loaded = reduce(loading, { type: fetchAcceptance.fulfilled.type, payload: ACCEPTANCE });
      const failed = reduce(loading, { type: fetchAcceptance.rejected.type });

      expect(loading.acceptanceStatus).toBe('loading');
      expect(loaded).toMatchObject({ acceptance: ACCEPTANCE, acceptanceStatus: 'succeeded' });
      expect(failed.acceptanceStatus).toBe('failed');
    });
  });

  describe('after the payment', () => {
    const processing = { ...initialCheckoutState, step: 'PROCESSING' as const };

    it('should show the result once the transaction is final, not before', () => {
      expect(reduce(processing, transactionUpdated(aTransaction())).step).toBe('PROCESSING');
      expect(
        reduce(processing, transactionUpdated(aTransaction({ status: 'APPROVED' }))).step,
      ).toBe('RESULT');
      expect(
        reduce(initialCheckoutState, transactionUpdated(aTransaction({ status: 'APPROVED' }))).step,
      ).toBe('PRODUCT');
    });

    it('should start a new attempt with the same product and drafts but no key or card', () => {
      const used = {
        ...processing,
        contact: { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' },
        idempotencyKey: 'k1',
        card: { brand: 'VISA', lastFour: '4242', holderName: 'Ana Pérez' },
        installments: 6,
      };

      const retry = reduce(used, retryWithAnotherCard({ productId: 'p1', quantity: 2 }));

      expect(retry).toMatchObject({
        step: 'PAYMENT_FORM',
        productId: 'p1',
        quantity: 2,
        contact: used.contact,
        installments: 6,
        idempotencyKey: null,
        card: null,
      });
    });
  });
});
