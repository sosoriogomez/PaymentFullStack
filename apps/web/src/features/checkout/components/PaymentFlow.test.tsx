import { screen, waitFor, within } from '@testing-library/react';
import { type UserEvent } from '@testing-library/user-event';
import { ACCEPTANCE, aProduct, CUSTOMER_ID, PRODUCT_ID, someAmounts } from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { renderWithStore } from '@test/support/render-with-store';
import { initialCatalogState } from '@/features/catalog/catalog.slice';
import { es } from '@/shared/i18n/es';
import { err, ok } from '@/shared/lib/result';
import { type CheckoutState, initialCheckoutState } from '../checkout.slice';
import { CheckoutFlow } from './PaymentFlow';

const card = es.checkout.card;
const delivery = es.checkout.delivery;

const servicesWithApi = () => {
  const services = createFakeServices();
  services.api.getAcceptance.mockResolvedValue(ok(ACCEPTANCE));
  services.cardTokenizer.tokenize.mockResolvedValue(
    ok({
      token: 'tok_1',
      brand: 'VISA',
      lastFour: '4242',
      expiresAt: Date.parse('2026-10-01T15:15:00Z'),
    }),
  );
  services.api.registerCustomer.mockResolvedValue(
    ok({ id: CUSTOMER_ID, fullName: 'Ana Pérez', email: 'a***@mail.com', phone: '***4567' }),
  );
  services.api.getQuote.mockResolvedValue(
    ok({ productId: PRODUCT_ID, quantity: 1, amounts: someAmounts() }),
  );
  return services;
};

const renderFlow = (checkout: Partial<CheckoutState> = {}, services = servicesWithApi()) =>
  renderWithStore(<CheckoutFlow />, {
    services,
    preloadedState: {
      catalog: { ...initialCatalogState, items: [aProduct()], status: 'succeeded' },
      checkout: {
        ...initialCheckoutState,
        step: 'PAYMENT_FORM',
        productId: PRODUCT_ID,
        quantity: 1,
        ...checkout,
      },
    },
  });

const fillForm = async (user: UserEvent) => {
  const field = (label: string) => screen.getByLabelText(label);
  await user.type(field(card.number), '4242424242424242');
  await user.type(field(card.holderName), 'Ana Pérez');
  await user.type(field(card.expiry), '1240');
  await user.type(field(card.cvc), '123');
  await user.type(field(delivery.fullName), 'Ana Pérez');
  await user.type(field(delivery.email), 'ana@mail.com');
  await user.type(field(delivery.phone), '3001234567');
  await user.type(field(delivery.addressLine1), 'Cra 43A # 1-50');
  await user.selectOptions(field(delivery.region), 'Antioquia');
  await user.type(field(delivery.city), 'Medellín');
  await user.click(await screen.findByRole('checkbox', { name: /reglamento/ }));
  await user.click(screen.getByRole('checkbox', { name: /datos personales/ }));
};

const continueButton = () => screen.getByRole('button', { name: es.checkout.continue });

describe('PaymentFlow', () => {
  it('should open the payment dialog with links to both gateway contracts', async () => {
    const { services } = renderFlow();

    const dialog = screen.getByRole('dialog', { name: es.checkout.modalTitle });
    const terms = await within(dialog).findByRole('link', { name: /reglamento/ });

    expect(services.api.getAcceptance).toHaveBeenCalledTimes(1);
    expect(terms).toHaveAttribute('href', ACCEPTANCE.acceptancePermalink);
    expect(terms).toHaveAttribute('target', '_blank');
    expect(terms).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(dialog).getByRole('link', { name: /datos personales/ })).toHaveAttribute(
      'href',
      ACCEPTANCE.personalDataAuthPermalink,
    );
  });

  it('should enable "Continuar" only when everything is valid and both terms are accepted', async () => {
    const { user, store, services } = renderFlow();
    expect(continueButton()).toBeDisabled();

    await fillForm(user);
    await waitFor(() => {
      expect(continueButton()).toBeEnabled();
    });
    await user.click(continueButton());

    await waitFor(() => {
      expect(store.getState().checkout.step).toBe('SUMMARY');
    });
    expect(services.cardTokenizer.tokenize).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: es.checkout.modalTitle })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: es.summary.title })).toBeInTheDocument();
  });

  it('should show the error inside the dialog and keep what was typed', async () => {
    const services = servicesWithApi();
    services.cardTokenizer.tokenize.mockResolvedValue(
      err({ code: 'CARD_REJECTED', status: 422, detail: null }),
    );
    const { user } = renderFlow({}, services);

    await fillForm(user);
    await waitFor(() => {
      expect(continueButton()).toBeEnabled();
    });
    await user.click(continueButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(es.errors.CARD_REJECTED);
    expect(screen.getByLabelText(delivery.fullName)).toHaveValue('Ana Pérez');
    expect(screen.getByLabelText(card.number)).toHaveValue('4242 4242 4242 4242');
  });

  it('should let the customer retry when the terms cannot be loaded', async () => {
    const services = servicesWithApi();
    services.api.getAcceptance
      .mockResolvedValueOnce(err({ code: 'GATEWAY_UNAVAILABLE', status: 503, detail: null }))
      .mockResolvedValueOnce(ok(ACCEPTANCE));
    const { user } = renderFlow({}, services);

    await user.click(await screen.findByRole('button', { name: es.checkout.terms.retry }));

    expect(await screen.findByRole('checkbox', { name: /reglamento/ })).toBeInTheDocument();
  });

  it('should save contact and delivery drafts, never card data', async () => {
    const { user, store } = renderFlow();

    await user.type(screen.getByLabelText(delivery.city), 'Medellín');
    await user.type(screen.getByLabelText(card.number), '4242424242424242');

    await waitFor(() => {
      expect(store.getState().checkout.delivery.city).toBe('Medellín');
    });
    expect(JSON.stringify(store.getState())).not.toContain('4242 4242');
  });

  it('should prefill the saved drafts and warn when the card must be entered again', async () => {
    renderFlow({
      contact: { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' },
      cardReentryRequired: true,
    });

    expect(screen.getByLabelText(delivery.fullName)).toHaveValue('Ana Pérez');
    expect(screen.getByText(card.reentry)).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /reglamento/ })).not.toBeChecked();
  });

  it('should close back to the product', async () => {
    const { user, store } = renderFlow();

    await user.click(screen.getByRole('button', { name: es.checkout.close }));

    expect(store.getState().checkout.step).toBe('PRODUCT');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render nothing outside the payment steps', () => {
    renderFlow({ step: 'PRODUCT' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
