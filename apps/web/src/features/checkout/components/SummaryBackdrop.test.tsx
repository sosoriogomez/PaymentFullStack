import { screen, waitFor, within } from '@testing-library/react';
import {
  ACCEPTANCE,
  aProduct,
  aTransaction,
  CUSTOMER_ID,
  PRODUCT_ID,
  someAmounts,
  TRANSACTION_ID,
} from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { renderRoute } from '@test/support/render-route';
import { renderWithStore } from '@test/support/render-with-store';
import { type RootState } from '@/app/store';
import { initialCatalogState } from '@/features/catalog/catalog.slice';
import { es } from '@/shared/i18n/es';
import { err, ok } from '@/shared/lib/result';
import { initialCheckoutState } from '../checkout.slice';
import { SummaryBackdrop } from './SummaryBackdrop';

const texts = es.summary;

const summaryState = (checkout: Partial<RootState['checkout']> = {}): Partial<RootState> => ({
  catalog: { ...initialCatalogState, items: [aProduct()], status: 'succeeded' },
  checkout: {
    ...initialCheckoutState,
    step: 'SUMMARY',
    productId: PRODUCT_ID,
    quantity: 1,
    contact: { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' },
    delivery: {
      addressLine1: 'Cra 43A # 1-50',
      addressLine2: 'Apto 301',
      city: 'Medellín',
      region: 'Antioquia',
      postalCode: '',
    },
    customerId: CUSTOMER_ID,
    card: { brand: 'VISA', lastFour: '4242', holderName: 'Ana Pérez' },
    cardToken: 'tok_1',
    cardTokenExpiresAt: Date.parse('2026-10-01T15:10:00Z'),
    installments: 3,
    acceptance: ACCEPTANCE,
    quote: someAmounts(),
    idempotencyKey: '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f',
    ...checkout,
  },
});

const payButton = () =>
  within(screen.getByRole('dialog', { name: texts.title })).getByRole('button', {
    name: /Pagar|Reintentar|Procesando/,
  });

describe('SummaryBackdrop', () => {
  it('should show the quoted breakdown, the masked card and the delivery', () => {
    renderWithStore(<SummaryBackdrop open />, { preloadedState: summaryState() });

    const dialog = screen.getByRole('dialog', { name: texts.title });
    const breakdown = within(dialog).getByLabelText(texts.breakdown);
    expect(breakdown).toHaveTextContent('Audífonos inalámbricos Pulse × 1');
    expect(breakdown).toHaveTextContent(/150\.000/);
    expect(breakdown).toHaveTextContent(/3\.000/);
    expect(breakdown).toHaveTextContent(/10\.000/);
    expect(within(dialog).getByText('VISA •••• 4242')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Visa' })).toBeInTheDocument();
    expect(within(dialog).getByText(texts.installments(3))).toBeInTheDocument();
    expect(
      within(dialog).getByText('Cra 43A # 1-50, Apto 301, Medellín, Antioquia'),
    ).toBeInTheDocument();
    expect(payButton().textContent).toContain('163.000');
  });

  it('should go back to the form with "Editar"', async () => {
    const { user, store } = renderWithStore(<SummaryBackdrop open />, {
      preloadedState: summaryState(),
    });

    await user.click(screen.getByRole('button', { name: texts.edit }));

    expect(store.getState().checkout.step).toBe('PAYMENT_FORM');
  });

  it('should explain a failed payment and offer a safe retry', () => {
    renderWithStore(<SummaryBackdrop open />, {
      preloadedState: summaryState({
        submission: { status: 'failed', error: { code: 'NETWORK_ERROR', message: 'Sin red.' } },
      }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent(`${texts.payFailed} Sin red.`);
    expect(screen.getByRole('alert')).toHaveTextContent(texts.safeRetry);
    expect(payButton()).toHaveTextContent(texts.retry);
  });

  it('should block the pay button while the payment is in flight', async () => {
    const services = createFakeServices();
    let answer: (value: Awaited<ReturnType<typeof services.api.createTransaction>>) => void = () =>
      undefined;
    services.api.createTransaction.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { user } = renderWithStore(<SummaryBackdrop open />, {
      preloadedState: summaryState(),
      services,
    });

    await user.click(payButton());
    await user.click(payButton());

    expect(payButton()).toBeDisabled();
    expect(payButton()).toHaveTextContent(texts.paying);
    expect(services.api.createTransaction).toHaveBeenCalledTimes(1);
    answer(err({ code: 'NETWORK_ERROR', status: null, detail: null }));
    await waitFor(() => {
      expect(payButton()).toBeEnabled();
    });
  });

  it('should render nothing without a quote', () => {
    renderWithStore(<SummaryBackdrop open />, { preloadedState: summaryState({ quote: null }) });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should open the status page once the payment is sent', async () => {
    const services = createFakeServices();
    services.api.createTransaction.mockResolvedValue(
      ok({ transaction: aTransaction(), replayed: false }),
    );
    const { user, router } = renderRoute('/', { preloadedState: summaryState(), services });

    await screen.findByRole('dialog', { name: texts.title });
    await user.click(payButton());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/transactions/${TRANSACTION_ID}`);
    });
  });
});
