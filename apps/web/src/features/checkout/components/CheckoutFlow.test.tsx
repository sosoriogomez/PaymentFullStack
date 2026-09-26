import { screen } from '@testing-library/react';
import { ACCEPTANCE, aProduct, aTransaction, PRODUCT_ID, TRANSACTION_ID } from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { renderRoute } from '@test/support/render-route';
import { initialCatalogState } from '@/features/catalog/catalog.slice';
import { initialTransactionState } from '@/features/transaction/transaction.slice';
import { es } from '@/shared/i18n/es';
import { ok } from '@/shared/lib/result';
import { type CheckoutState, initialCheckoutState } from '../checkout.slice';

const renderCatalog = (checkout: Partial<CheckoutState>, withTransaction = false) => {
  const services = createFakeServices();
  services.api.getAcceptance.mockResolvedValue(ok(ACCEPTANCE));
  services.api.getTransaction.mockResolvedValue(ok(aTransaction()));
  return renderRoute('/', {
    services,
    preloadedState: {
      catalog: { ...initialCatalogState, items: [aProduct()], status: 'succeeded' },
      checkout: { ...initialCheckoutState, productId: PRODUCT_ID, quantity: 1, ...checkout },
      ...(withTransaction
        ? { transaction: { ...initialTransactionState, current: aTransaction() } }
        : {}),
    },
  });
};

describe('CheckoutFlow', () => {
  it('should download the payment form on demand and open it', async () => {
    renderCatalog({ step: 'PAYMENT_FORM' });

    const cardNumber = await screen.findByLabelText(es.checkout.card.number);

    expect(screen.getByRole('dialog', { name: es.checkout.modalTitle })).toContainElement(
      cardNumber,
    );
  });

  it('should show that the payment is being verified while a refresh recovers it', () => {
    renderCatalog({ step: 'PROCESSING' });

    expect(screen.getByRole('dialog', { name: es.checkout.modalTitle })).toHaveTextContent(
      es.checkout.recovering,
    );
    expect(screen.queryByRole('button', { name: es.checkout.close })).not.toBeInTheDocument();
  });

  it('should move to the status page once the payment has a transaction', async () => {
    const { router } = renderCatalog({ step: 'PROCESSING' }, true);

    expect(router.state.location.pathname).toBe(`/transactions/${TRANSACTION_ID}`);
    expect(await screen.findByText(aTransaction().reference)).toBeInTheDocument();
  });

  it('should render nothing outside the payment steps', () => {
    renderCatalog({ step: 'PRODUCT' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
