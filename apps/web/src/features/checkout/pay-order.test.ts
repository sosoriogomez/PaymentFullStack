import {
  ACCEPTANCE,
  aProduct,
  aTransaction,
  CUSTOMER_ID,
  PRODUCT_ID,
  someAmounts,
} from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { createAppStore, type RootState } from '@/app/store';
import { initialCatalogState } from '@/features/catalog/catalog.slice';
import { err, ok } from '@/shared/lib/result';
import { payOrder } from './checkout.actions';
import { initialCheckoutState } from './checkout.slice';

const KEY = '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f';
/** Time of the FixedClock in the fake services. */
const NOW = Date.parse('2026-10-01T15:00:00Z');

const setup = (checkout: Partial<RootState['checkout']> = {}) => {
  const services = createFakeServices();
  const summary: RootState['checkout'] = {
    ...initialCheckoutState,
    step: 'SUMMARY',
    productId: PRODUCT_ID,
    quantity: 2,
    contact: { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' },
    delivery: {
      addressLine1: 'Cra 43A # 1-50',
      addressLine2: '',
      city: 'Medellín',
      region: 'Antioquia',
      postalCode: '050021',
    },
    customerId: CUSTOMER_ID,
    card: { brand: 'VISA', lastFour: '4242', holderName: 'Ana Pérez' },
    cardToken: 'tok_1',
    cardTokenExpiresAt: services.clock.now() + 60_000,
    installments: 3,
    acceptance: ACCEPTANCE,
    acceptanceStatus: 'succeeded',
    quote: someAmounts({ total: 313_000_00 }),
    idempotencyKey: KEY,
    ...checkout,
  };
  const store = createAppStore(services, {
    catalog: { ...initialCatalogState, items: [aProduct()], status: 'succeeded' },
    checkout: summary,
  });
  return { store, services };
};

describe('payOrder', () => {
  it('should send the order with the purchase key and move to processing', async () => {
    const { store, services } = setup();
    services.api.createTransaction.mockResolvedValue(
      ok({ transaction: aTransaction(), replayed: false }),
    );

    await store.dispatch(payOrder());

    expect(services.api.createTransaction).toHaveBeenCalledWith(
      {
        productId: PRODUCT_ID,
        quantity: 2,
        customerId: CUSTOMER_ID,
        delivery: {
          recipientName: 'Ana Pérez',
          recipientPhone: '3001234567',
          addressLine1: 'Cra 43A # 1-50',
          city: 'Medellín',
          region: 'Antioquia',
          country: 'CO',
          postalCode: '050021',
        },
        payment: {
          cardToken: 'tok_1',
          installments: 3,
          acceptanceToken: ACCEPTANCE.acceptanceToken,
          acceptPersonalAuth: ACCEPTANCE.personalDataAuthToken,
        },
      },
      KEY,
    );
    const state = store.getState();
    expect(state.checkout).toMatchObject({ step: 'PROCESSING', cardToken: null });
    expect(state.transaction.current).toEqual(aTransaction());
  });

  it('should send a single request on a double click', async () => {
    const { store, services } = setup();
    services.api.createTransaction.mockResolvedValue(
      ok({ transaction: aTransaction(), replayed: false }),
    );

    await Promise.all([store.dispatch(payOrder()), store.dispatch(payOrder())]);

    expect(services.api.createTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an expired card token (I-18)', { cardTokenExpiresAt: NOW - 1 }],
    ['no card token after a refresh', { cardToken: null }],
    ['no acceptance tokens', { acceptance: null }],
  ])('should ask for the card again with %s, keeping the key', async (_, change) => {
    const { store, services } = setup(change);

    await store.dispatch(payOrder());

    expect(services.api.createTransaction).not.toHaveBeenCalled();
    expect(store.getState().checkout).toMatchObject({
      step: 'PAYMENT_FORM',
      cardReentryRequired: true,
      cardToken: null,
      idempotencyKey: KEY,
    });
  });

  it('should go back to the product with fresh stock when it ran out', async () => {
    const { store, services } = setup();
    services.api.createTransaction.mockResolvedValue(
      err({ code: 'INSUFFICIENT_STOCK', status: 409, detail: null }),
    );
    services.api.getProductStock.mockResolvedValue(
      ok({ productId: PRODUCT_ID, available: 1, updatedAt: '2026-10-01T15:00:00Z' }),
    );

    await store.dispatch(payOrder());

    await Promise.resolve();
    const state = store.getState();
    expect(state.checkout.step).toBe('PRODUCT');
    expect(state.checkout.submission.error?.code).toBe('INSUFFICIENT_STOCK');
    expect(services.api.getProductStock).toHaveBeenCalledWith(PRODUCT_ID);
    expect(state.catalog.items[0]?.stock).toBe(1);
  });

  it('should continue with the transaction the key already produced (422)', async () => {
    const { store, services } = setup();
    services.api.createTransaction.mockResolvedValue(
      err({ code: 'IDEMPOTENCY_CONFLICT', status: 422, detail: null }),
    );
    services.api.findTransactionByIdempotencyKey.mockResolvedValue(
      ok(aTransaction({ status: 'APPROVED' })),
    );

    await store.dispatch(payOrder());

    expect(services.api.findTransactionByIdempotencyKey).toHaveBeenCalledWith(KEY);
    expect(store.getState().checkout.step).toBe('PROCESSING');
    expect(store.getState().transaction.current?.status).toBe('APPROVED');
  });

  it('should report a 422 it cannot recover from', async () => {
    const { store, services } = setup();
    services.api.createTransaction.mockResolvedValue(
      err({ code: 'IDEMPOTENCY_CONFLICT', status: 422, detail: null }),
    );
    services.api.findTransactionByIdempotencyKey.mockResolvedValue(
      err({ code: 'NETWORK_ERROR', status: null, detail: null }),
    );

    await store.dispatch(payOrder());

    expect(store.getState().checkout).toMatchObject({
      step: 'SUMMARY',
      submission: { status: 'failed', error: { code: 'IDEMPOTENCY_CONFLICT' } },
    });
  });

  it('should let the customer retry with the same key when the answer did not arrive', async () => {
    const { store, services } = setup();
    services.api.createTransaction
      .mockResolvedValueOnce(err({ code: 'GATEWAY_UNAVAILABLE', status: 503, detail: null }))
      .mockResolvedValueOnce(ok({ transaction: aTransaction(), replayed: true }));

    await store.dispatch(payOrder());
    expect(store.getState().checkout).toMatchObject({
      step: 'SUMMARY',
      submission: { status: 'failed', error: { code: 'GATEWAY_UNAVAILABLE' } },
    });

    await store.dispatch(payOrder());
    expect(services.api.createTransaction).toHaveBeenLastCalledWith(expect.anything(), KEY);
    expect(store.getState().checkout.step).toBe('PROCESSING');
  });
});
