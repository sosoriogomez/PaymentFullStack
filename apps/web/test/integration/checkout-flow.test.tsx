import { act, screen, waitFor, within } from '@testing-library/react';
import { type UserEvent } from '@testing-library/user-event';
import {
  ACCEPTANCE,
  aDelivery,
  aProduct,
  aTransaction,
  CUSTOMER_ID,
  DELIVERY_ID,
  PRODUCT_ID,
  someAmounts,
} from '@test/builders';
import { createFakeServices, type FakeServices } from '@test/fakes/fake-services';
import { renderRoute } from '@test/support/render-route';
import { preloadDeferredChunks } from '@/app/lazy-pages';
import { registerPersistenceListener } from '@/app/persistence/persistence.listener';
import { registerPollingListener } from '@/features/transaction/polling.listener';
import { type Transaction } from '@/shared/api/contracts';
import { es } from '@/shared/i18n/es';
import { formatCOP } from '@/shared/lib/money';
import { ok } from '@/shared/lib/result';

/**
 * The five screens of the test, end to end: real store, reducers, thunks, listeners (polling and
 * persistence) and routes; only the API, the card tokenizer and the browser are fakes.
 */
const CARD_NUMBER = '4242424242424242';
const CVC = '123';
const CARD_TOKEN = 'tok_test_1';

const checkoutServices = (finalTransaction: Transaction) => {
  const services: FakeServices = createFakeServices();
  const { api } = services;
  api.listProducts
    .mockResolvedValueOnce(ok([aProduct({ stock: 5 })]))
    .mockResolvedValue(ok([aProduct({ stock: 4 })]));
  api.getProductStock.mockResolvedValue(
    ok({ productId: PRODUCT_ID, available: 4, updatedAt: '2026-10-01T15:01:00Z' }),
  );
  api.getAcceptance.mockResolvedValue(ok(ACCEPTANCE));
  services.cardTokenizer.tokenize.mockResolvedValue(
    ok({
      token: CARD_TOKEN,
      brand: 'VISA',
      lastFour: '4242',
      expiresAt: services.clock.now() + 15 * 60_000,
    }),
  );
  api.registerCustomer.mockResolvedValue(
    ok({ id: CUSTOMER_ID, fullName: 'Ana Pérez', email: 'a***@mail.com', phone: '***4567' }),
  );
  api.getQuote.mockResolvedValue(
    ok({ productId: PRODUCT_ID, quantity: 1, amounts: someAmounts() }),
  );
  api.createTransaction.mockResolvedValue(ok({ transaction: aTransaction(), replayed: false }));
  api.getTransaction.mockResolvedValue(ok(finalTransaction));
  api.getDelivery.mockResolvedValue(ok(aDelivery()));
  return services;
};

const startCheckout = (services: FakeServices) =>
  renderRoute('/', {
    services,
    registrations: [registerPollingListener, registerPersistenceListener],
    userOptions: {
      advanceTimers: (ms) => {
        jest.advanceTimersByTime(ms);
      },
    },
  });

const tick = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));

// Intl separates "$" with a non-breaking space: text queries normalize it, accessible names do not.
const money = (cents: number) => formatCOP(cents).replace(/\s/g, ' ');

/** Steps 1 → 3 (product, card and delivery, summary) up to the status page confirming the payment. */
async function payFromTheCatalog(user: UserEvent) {
  const product = await screen.findByRole('article', { name: aProduct().name });
  expect(within(product).getByText(es.catalog.available(5))).toBeInTheDocument();
  await user.click(within(product).getByRole('button', { name: es.catalog.payWithCard }));

  const card = es.checkout.card;
  const delivery = es.checkout.delivery;
  const dialog = await screen.findByRole('dialog', { name: es.checkout.modalTitle });
  const field = (label: string) => within(dialog).getByLabelText(label);
  await user.type(field(card.number), CARD_NUMBER);
  expect(within(dialog).getByRole('img', { name: 'Visa' })).toBeInTheDocument();
  await user.type(field(card.holderName), 'Ana Pérez');
  await user.type(field(card.expiry), '1240');
  await user.type(field(card.cvc), CVC);
  await user.type(field(delivery.fullName), 'Ana Pérez');
  await user.type(field(delivery.email), 'ana@mail.com');
  await user.type(field(delivery.phone), '3001234567');
  await user.type(field(delivery.addressLine1), 'Cra 43A # 1-50');
  await user.selectOptions(field(delivery.region), 'Antioquia');
  await user.type(field(delivery.city), 'Medellín');
  await user.click(await within(dialog).findByRole('checkbox', { name: /reglamento/ }));
  await user.click(within(dialog).getByRole('checkbox', { name: /datos personales/ }));
  const continueButton = within(dialog).getByRole('button', { name: es.checkout.continue });
  await waitFor(() => {
    expect(continueButton).toBeEnabled();
  });
  await user.click(continueButton);

  const summary = await screen.findByRole('dialog', { name: es.summary.title });
  expect(within(summary).getByText(money(someAmounts().baseFee))).toBeInTheDocument();
  expect(within(summary).getByText(money(someAmounts().deliveryFee))).toBeInTheDocument();
  await user.click(
    within(summary).getByRole('button', { name: es.summary.pay(formatCOP(someAmounts().total)) }),
  );

  // Navigations render in a transition: wait for the page instead of the URL.
  expect(await screen.findByRole('heading', { name: es.status.PENDING.title })).toBeInTheDocument();
}

describe('Checkout flow (steps 1 → 5)', () => {
  beforeAll(async () => {
    await preloadDeferredChunks();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should pay an approved purchase and come back to the product with the stock updated', async () => {
    const services = checkoutServices(
      aTransaction({ status: 'APPROVED', deliveryId: DELIVERY_ID }),
    );
    const { user, router, store } = startCheckout(services);

    await payFromTheCatalog(user);

    expect(router.state.location.pathname).toBe(`/transactions/${aTransaction().id}`);
    await tick(2000);
    expect(
      await screen.findByRole('heading', { name: es.status.APPROVED.title }),
    ).toBeInTheDocument();
    expect(await screen.findByText(es.status.ASSIGNED)).toBeInTheDocument();
    expect(services.api.createTransaction).toHaveBeenCalledTimes(1);
    expect(services.api.createTransaction.mock.calls[0]?.[0]).toMatchObject({
      productId: PRODUCT_ID,
      quantity: 1,
      customerId: CUSTOMER_ID,
      payment: { cardToken: CARD_TOKEN, installments: 1 },
    });

    await user.click(screen.getByRole('button', { name: es.status.backToStore }));

    const product = await screen.findByRole('article', { name: aProduct().name });
    expect(await within(product).findByText(es.catalog.available(4))).toBeInTheDocument();
    expect(store.getState().checkout.step).toBe('PRODUCT');
  });

  it('should explain a declined payment and let the customer try another card', async () => {
    const services = checkoutServices(
      aTransaction({ status: 'DECLINED', statusMessage: 'Fondos insuficientes' }),
    );
    const { user } = startCheckout(services);

    await payFromTheCatalog(user);
    await tick(2000);

    expect(
      await screen.findByRole('heading', { name: es.status.DECLINED.title }),
    ).toBeInTheDocument();
    expect(screen.getByText('Fondos insuficientes')).toBeInTheDocument();
    expect(services.api.getDelivery).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: es.status.tryAnotherCard }));

    const dialog = await screen.findByRole('dialog', { name: es.checkout.modalTitle });
    expect(within(dialog).getByLabelText(es.checkout.delivery.city)).toHaveValue('Medellín');
    expect(within(dialog).getByLabelText(es.checkout.card.number)).toHaveValue('');
  });

  it('should never write the card, its CVC or its token to the browser storage', async () => {
    const services = checkoutServices(aTransaction({ status: 'APPROVED' }));
    const writes = jest.spyOn(services.storage, 'setItem');
    const { user } = startCheckout(services);

    await payFromTheCatalog(user);
    await tick(2000);
    await screen.findByRole('heading', { name: es.status.APPROVED.title });

    const saved = writes.mock.calls.map(([, value]) => value).join('\n');
    expect(saved).toContain(aTransaction().id);
    [CARD_NUMBER, '4242 4242 4242 4242', CARD_TOKEN, `"${CVC}"`].forEach((secret) => {
      expect(saved).not.toContain(secret);
    });
  });
});
