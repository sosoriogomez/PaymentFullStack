import { screen, within } from '@testing-library/react';
import { aProduct } from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { renderRoute } from '@test/support/render-route';
import { es } from '@/shared/i18n/es';
import { err, ok } from '@/shared/lib/result';

const secondProduct = aProduct({
  id: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e05',
  name: 'Hub USB-C',
  stock: 0,
});

const withProducts = () => {
  const services = createFakeServices();
  services.api.listProducts.mockResolvedValue(ok([aProduct(), secondProduct]));
  return services;
};

describe('ProductPage', () => {
  it('should show skeletons while loading and then the catalog', async () => {
    const view = renderRoute('/', { services: withProducts() });

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(await screen.findByRole('article', { name: aProduct().name })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Hub USB-C' })).toBeInTheDocument();
    expect(view.services.api.listProducts).toHaveBeenCalledTimes(1);
  });

  it('should load the first image with high priority', async () => {
    renderRoute('/', { services: withProducts() });

    const [first, second] = await screen.findAllByRole('img');
    expect(first).toHaveAttribute('fetchpriority', 'high');
    expect(second).toHaveAttribute('loading', 'lazy');
  });

  it('should open the checkout for the chosen product and quantity', async () => {
    const view = renderRoute('/', { services: withProducts() });
    const card = await screen.findByRole('article', { name: aProduct().name });

    await view.user.click(within(card).getByRole('button', { name: 'Aumentar cantidad' }));
    await view.user.click(within(card).getByRole('button', { name: es.catalog.payWithCard }));

    expect(view.store.getState().checkout).toMatchObject({
      step: 'PAYMENT_FORM',
      productId: aProduct().id,
      quantity: 2,
    });
  });

  it('should explain loading errors and retry', async () => {
    const services = createFakeServices();
    services.api.listProducts
      .mockResolvedValueOnce(err({ code: 'NETWORK_ERROR', status: null, detail: null }))
      .mockResolvedValueOnce(ok([aProduct()]));
    const view = renderRoute('/', { services });

    expect(await screen.findByRole('alert')).toHaveTextContent(es.errors.NETWORK_ERROR);
    await view.user.click(screen.getByRole('button', { name: es.catalog.retry }));

    expect(await screen.findByRole('article', { name: aProduct().name })).toBeInTheDocument();
  });

  it('should tell when there are no products', async () => {
    const services = createFakeServices();
    services.api.listProducts.mockResolvedValue(ok([]));
    renderRoute('/', { services });

    expect(await screen.findByText(es.catalog.empty)).toBeInTheDocument();
  });

  it('should not reload the catalog when it is already loaded', () => {
    const services = withProducts();
    renderRoute('/', {
      services,
      preloadedState: { catalog: { items: [aProduct()], status: 'succeeded', error: null } },
    });

    expect(services.api.listProducts).not.toHaveBeenCalled();
    expect(screen.getByRole('article', { name: aProduct().name })).toBeInTheDocument();
  });
});
