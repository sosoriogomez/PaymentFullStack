import { aTransaction, PRODUCT_ID } from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { createAppStore, type RootState } from '@/app/store';
import { initialTransactionState } from '@/features/transaction/transaction.slice';
import { err, ok } from '@/shared/lib/result';
import { recoverCheckout } from './checkout.recovery';
import { type CheckoutStep, initialCheckoutState } from './checkout.slice';

const KEY = '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f';
const notFound = err({ code: 'TRANSACTION_NOT_FOUND', status: 404, detail: null });

/** The store as a refresh restores it (persisted fields only, see persisted-state.ts). */
const restored = (step: CheckoutStep, transaction = initialTransactionState.current) => {
  const services = createFakeServices();
  const store = createAppStore(services, {
    checkout: {
      ...initialCheckoutState,
      step,
      productId: PRODUCT_ID,
      contact: { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' },
      card: { brand: 'VISA', lastFour: '4242', holderName: 'Ana Pérez' },
      idempotencyKey: KEY,
    },
    transaction: { ...initialTransactionState, current: transaction },
  } satisfies Partial<RootState>);
  return { store, services };
};

describe('recoverCheckout (spec §2.4)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each<CheckoutStep>(['PRODUCT', 'PAYMENT_FORM', 'RESULT'])(
    'should keep %s as it was',
    async (step) => {
      const { store, services } = restored(step, step === 'RESULT' ? aTransaction() : null);

      await store.dispatch(recoverCheckout());

      expect(store.getState().checkout).toMatchObject({ step, cardReentryRequired: false });
      expect(services.api.findTransactionByIdempotencyKey).not.toHaveBeenCalled();
    },
  );

  it('should send SUMMARY back to the form to enter the card again, keeping the key', async () => {
    const { store } = restored('SUMMARY');

    await store.dispatch(recoverCheckout());

    expect(store.getState().checkout).toMatchObject({
      step: 'PAYMENT_FORM',
      cardReentryRequired: true,
      idempotencyKey: KEY,
      contact: { fullName: 'Ana Pérez' },
    });
  });

  it('should resume a PROCESSING transaction without asking for the key', async () => {
    const { store, services } = restored('PROCESSING', aTransaction());

    await store.dispatch(recoverCheckout());

    expect(store.getState().checkout.step).toBe('PROCESSING');
    expect(services.api.findTransactionByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('should find the transaction of an interrupted POST by its key (retrying while in flight)', async () => {
    const { store, services } = restored('PROCESSING');
    services.api.findTransactionByIdempotencyKey
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(ok(aTransaction()));

    const recovery = store.dispatch(recoverCheckout());
    await jest.advanceTimersByTimeAsync(1000);
    await recovery;

    expect(services.api.findTransactionByIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(services.api.findTransactionByIdempotencyKey).toHaveBeenCalledWith(KEY);
    expect(store.getState().transaction.current).toEqual(aTransaction());
    expect(store.getState().checkout.step).toBe('PROCESSING');
  });

  it('should go back to the form with the SAME key when the POST never arrived (C-04)', async () => {
    const { store, services } = restored('PROCESSING');
    services.api.findTransactionByIdempotencyKey.mockResolvedValue(notFound);

    const recovery = store.dispatch(recoverCheckout());
    await jest.advanceTimersByTimeAsync(3000);
    await recovery;

    expect(services.api.findTransactionByIdempotencyKey).toHaveBeenCalledTimes(3);
    expect(store.getState().checkout).toMatchObject({
      step: 'PAYMENT_FORM',
      cardReentryRequired: true,
      idempotencyKey: KEY,
    });
  });

  it('should go back to the form when PROCESSING has neither transaction nor key', async () => {
    const services = createFakeServices();
    const store = createAppStore(services, {
      checkout: { ...initialCheckoutState, step: 'PROCESSING', productId: PRODUCT_ID },
    });

    await store.dispatch(recoverCheckout());

    expect(store.getState().checkout.step).toBe('PAYMENT_FORM');
    expect(services.api.findTransactionByIdempotencyKey).not.toHaveBeenCalled();
  });
});
