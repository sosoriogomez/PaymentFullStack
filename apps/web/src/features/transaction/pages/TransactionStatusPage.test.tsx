import { act, screen, waitFor } from '@testing-library/react';
import {
  aDelivery,
  aProduct,
  aTransaction,
  DELIVERY_ID,
  PRODUCT_ID,
  TRANSACTION_ID,
} from '@test/builders';
import { createFakeServices, type FakeServices } from '@test/fakes/fake-services';
import { renderRoute } from '@test/support/render-route';
import { type RootState } from '@/app/store';
import { initialCatalogState } from '@/features/catalog/catalog.slice';
import { initialCheckoutState } from '@/features/checkout/checkout.slice';
import { type Transaction } from '@/shared/api/contracts';
import { es } from '@/shared/i18n/es';
import { err, ok } from '@/shared/lib/result';
import { registerPollingListener } from '../polling.listener';
import { initialTransactionState } from '../transaction.slice';

const texts = es.status;
const PATH = `/transactions/${TRANSACTION_ID}`;

const servicesAnswering = (...transactions: Transaction[]) => {
  const services: FakeServices = createFakeServices();
  transactions.forEach((transaction) => {
    services.api.getTransaction.mockResolvedValueOnce(ok(transaction));
  });
  services.api.getDelivery.mockResolvedValue(ok(aDelivery()));
  services.api.listProducts.mockResolvedValue(ok([aProduct({ stock: 3 })]));
  services.api.getProductStock.mockResolvedValue(
    ok({ productId: PRODUCT_ID, available: 3, updatedAt: '2026-10-01T15:00:00Z' }),
  );
  return services;
};

/** State right after paying: the checkout is PROCESSING and the transaction is PENDING. */
const afterPaying = (transaction = aTransaction()): Partial<RootState> => ({
  catalog: { ...initialCatalogState, items: [aProduct()], status: 'succeeded' },
  checkout: {
    ...initialCheckoutState,
    step: 'PROCESSING',
    productId: PRODUCT_ID,
    idempotencyKey: '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f',
  },
  transaction: { ...initialTransactionState, current: transaction },
});

const renderStatus = (services: FakeServices, preloadedState?: Partial<RootState>) =>
  renderRoute(PATH, {
    services,
    registrations: [registerPollingListener],
    userOptions: {
      advanceTimers: (ms) => {
        jest.advanceTimersByTime(ms);
      },
    },
    ...(preloadedState ? { preloadedState } : {}),
  });

const tick = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

describe('TransactionStatusPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should confirm the payment while polling, then show it approved with its delivery', async () => {
    const services = servicesAnswering(
      aTransaction({ status: 'APPROVED', deliveryId: DELIVERY_ID }),
    );
    const { store } = renderStatus(services, afterPaying());
    expect(screen.getByRole('heading', { name: texts.PENDING.title })).toBeInTheDocument();

    await tick(2000);

    expect(await screen.findByRole('heading', { name: texts.APPROVED.title })).toBeInTheDocument();
    expect(screen.getByText('TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W')).toBeInTheDocument();
    expect(await screen.findByText(texts.ASSIGNED)).toBeInTheDocument();
    expect(services.api.getDelivery).toHaveBeenCalledWith(DELIVERY_ID);
    expect(store.getState().checkout.step).toBe('RESULT');
  });

  it('should load the transaction by id on a deep link without saved state (I-10)', async () => {
    const services = servicesAnswering(
      aTransaction({ status: 'DECLINED', statusMessage: 'Fondos insuficientes' }),
    );

    renderStatus(services);

    expect(await screen.findByRole('heading', { name: texts.DECLINED.title })).toBeInTheDocument();
    expect(screen.getByText('Fondos insuficientes')).toBeInTheDocument();
    expect(services.api.getTransaction).toHaveBeenCalledWith(TRANSACTION_ID);
  });

  it('should offer to check again after the polling times out', async () => {
    const services = createFakeServices();
    services.api.getTransaction.mockResolvedValue(ok(aTransaction()));
    const { user } = renderStatus(services, afterPaying());

    await tick(90_000);
    expect(await screen.findByRole('heading', { name: texts.TIMEOUT.title })).toBeInTheDocument();
    services.api.getTransaction.mockResolvedValue(ok(aTransaction({ status: 'APPROVED' })));
    await user.click(screen.getByRole('button', { name: texts.checkAgain }));
    await tick(2000);

    expect(await screen.findByRole('heading', { name: texts.APPROVED.title })).toBeInTheDocument();
  });

  it('should go back to the store with the stock read again', async () => {
    const services = servicesAnswering();
    const { user, store, router } = renderStatus(
      services,
      afterPaying(aTransaction({ status: 'APPROVED' })),
    );

    await user.click(screen.getByRole('button', { name: texts.backToStore }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(store.getState().checkout).toEqual(initialCheckoutState);
    expect(services.api.listProducts).toHaveBeenCalled();
    expect(services.api.getProductStock).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it('should go back to the store by itself after 10 s unless the customer stays', async () => {
    const final = afterPaying(aTransaction({ status: 'APPROVED' }));
    const first = renderStatus(servicesAnswering(), final);
    expect(screen.getByRole('timer')).toHaveTextContent(texts.redirect(10));

    for (let second = 0; second <= 10; second += 1) await tick(1000);
    await waitFor(() => {
      expect(first.router.state.location.pathname).toBe('/');
    });
    first.unmount();

    const second = renderStatus(servicesAnswering(), final);
    await second.user.click(screen.getByRole('button', { name: texts.stay }));
    for (let second = 0; second <= 15; second += 1) await tick(1000);
    expect(second.router.state.location.pathname).toBe(PATH);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('should retry with another card: same product, delivery kept, new purchase key', async () => {
    const { user, store, router } = renderStatus(
      servicesAnswering(),
      afterPaying(
        aTransaction({ status: 'ERROR', product: { id: PRODUCT_ID, name: 'x', quantity: 2 } }),
      ),
    );

    await user.click(screen.getByRole('button', { name: texts.tryAnotherCard }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(store.getState().checkout).toMatchObject({
      step: 'PAYMENT_FORM',
      productId: PRODUCT_ID,
      quantity: 2,
      idempotencyKey: null,
    });
    expect(store.getState().transaction.current).toBeNull();
  });

  it('should explain a transaction that does not exist', async () => {
    const services = createFakeServices();
    services.api.getTransaction.mockResolvedValue(
      err({ code: 'TRANSACTION_NOT_FOUND', status: 404, detail: null }),
    );

    renderStatus(services);

    expect(await screen.findByRole('alert')).toHaveTextContent(texts.notFound);
    expect(screen.getByRole('link', { name: texts.backToStore })).toHaveAttribute('href', '/');
  });

  it('should stop polling when the customer leaves the page', async () => {
    const services = createFakeServices();
    services.api.getTransaction.mockResolvedValue(ok(aTransaction()));
    const { unmount, store } = renderStatus(services, afterPaying());

    unmount();
    await tick(30_000);

    expect(services.api.getTransaction).not.toHaveBeenCalled();
    expect(store.getState().transaction.polling).toBe('idle');
  });
});
