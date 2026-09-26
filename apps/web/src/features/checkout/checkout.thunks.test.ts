import { type UnknownAction } from '@reduxjs/toolkit';
import { aPaymentForm, CUSTOMER_ID, PRODUCT_ID, someAmounts } from '@test/builders';
import { createFakeServices, type FakeServices } from '@test/fakes/fake-services';
import { createAppStore, type RootState } from '@/app/store';
import { es } from '@/shared/i18n/es';
import { err, ok } from '@/shared/lib/result';
import { initialCheckoutState } from './checkout.slice';
import { submitPaymentForm } from './checkout.thunks';

const TOKEN_EXPIRES_AT = Date.parse('2026-10-01T15:15:00Z');

const setup = (checkout: Partial<RootState['checkout']> = {}) => {
  const services: FakeServices = createFakeServices();
  services.cardTokenizer.tokenize.mockResolvedValue(
    ok({ token: 'tok_test_1', brand: 'VISA', lastFour: '4242', expiresAt: TOKEN_EXPIRES_AT }),
  );
  services.api.registerCustomer.mockResolvedValue(
    ok({ id: CUSTOMER_ID, fullName: 'Ana Pérez', email: 'a***@mail.com', phone: '***4567' }),
  );
  services.api.getQuote.mockResolvedValue(
    ok({ productId: PRODUCT_ID, quantity: 2, amounts: someAmounts({ total: 313_000_00 }) }),
  );
  const actions: UnknownAction[] = [];
  const store = createAppStore(
    services,
    {
      checkout: {
        ...initialCheckoutState,
        step: 'PAYMENT_FORM',
        productId: PRODUCT_ID,
        quantity: 2,
        ...checkout,
      },
    },
    [
      (startListening) =>
        startListening({
          predicate: () => true,
          effect: (action) => {
            actions.push(action);
          },
        }),
    ],
  );
  return { store, services, actions };
};

describe('submitPaymentForm', () => {
  it('should tokenize, register the customer, quote and move to the summary', async () => {
    const { store, services } = setup();

    await store.dispatch(submitPaymentForm(aPaymentForm({ installments: 3 })));

    expect(services.cardTokenizer.tokenize).toHaveBeenCalledWith({
      number: '4242424242424242',
      cvc: '123',
      expMonth: '12',
      expYear: '40',
      holderName: 'Ana Pérez',
    });
    expect(services.api.registerCustomer).toHaveBeenCalledWith({
      fullName: 'Ana Pérez',
      email: 'ana@mail.com',
      phone: '3001234567',
    });
    expect(services.api.getQuote).toHaveBeenCalledWith({ productId: PRODUCT_ID, quantity: 2 });
    expect(store.getState().checkout).toMatchObject({
      step: 'SUMMARY',
      card: { brand: 'VISA', lastFour: '4242', holderName: 'Ana Pérez' },
      cardToken: 'tok_test_1',
      cardTokenExpiresAt: TOKEN_EXPIRES_AT,
      customerId: CUSTOMER_ID,
      installments: 3,
      quote: { total: 313_000_00 },
      delivery: { city: 'Medellín', region: 'Antioquia', postalCode: '050021' },
      contact: { email: 'ana@mail.com' },
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      submission: { status: 'idle', error: null },
    });
  });

  it('should never put the card number, the CVC or the expiry in any action', async () => {
    const { store, actions } = setup();

    await store.dispatch(submitPaymentForm(aPaymentForm()));

    const dispatched = JSON.stringify(actions);
    expect(actions.length).toBeGreaterThan(0);
    expect(dispatched).not.toContain('4242424242424242');
    expect(dispatched).not.toContain('4242 4242 4242 4242');
    expect(dispatched).not.toContain('"cvc"');
    expect(dispatched).not.toContain('12/40');
  });

  it('should keep an existing idempotency key when the card is entered again (C-04)', async () => {
    const key = '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f';
    const { store } = setup({ idempotencyKey: key, cardReentryRequired: true });

    await store.dispatch(submitPaymentForm(aPaymentForm()));

    expect(store.getState().checkout).toMatchObject({
      idempotencyKey: key,
      cardReentryRequired: false,
    });
  });

  it.each([
    ['tokenization', 'cardTokenizer', 'CARD_REJECTED', es.errors.CARD_REJECTED],
    ['the customer', 'registerCustomer', 'VALIDATION_ERROR', es.errors.VALIDATION_ERROR],
    ['the quote', 'getQuote', 'INSUFFICIENT_STOCK', es.errors.INSUFFICIENT_STOCK],
  ] as const)(
    'should stay on the form with a message when %s fails',
    async (_, step, code, message) => {
      const { store, services } = setup();
      const failure = err({ code, status: 400, detail: null });
      if (step === 'cardTokenizer') services.cardTokenizer.tokenize.mockResolvedValue(failure);
      else services.api[step].mockResolvedValue(failure);

      await store.dispatch(submitPaymentForm(aPaymentForm()));

      expect(store.getState().checkout).toMatchObject({
        step: 'PAYMENT_FORM',
        cardToken: null,
        idempotencyKey: null,
        submission: { status: 'failed', error: { code, message } },
      });
    },
  );

  it('should stop the chain at the first failure', async () => {
    const { store, services } = setup();
    services.cardTokenizer.tokenize.mockResolvedValue(
      err({ code: 'CARD_REJECTED', status: 422, detail: null }),
    );

    await store.dispatch(submitPaymentForm(aPaymentForm()));

    expect(services.api.registerCustomer).not.toHaveBeenCalled();
    expect(services.api.getQuote).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a submission is already in flight',
      { submission: { status: 'pending' as const, error: null } },
    ],
    ['no product was chosen', { productId: null }],
  ])('should do nothing when %s', async (_, checkout) => {
    const { store, services } = setup(checkout);

    await store.dispatch(submitPaymentForm(aPaymentForm()));

    expect(services.cardTokenizer.tokenize).not.toHaveBeenCalled();
  });
});
