import { aProduct } from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { createAppStore } from '@/app/store';
import { err, ok } from '@/shared/lib/result';
import { fetchProducts, refreshProductStock } from './catalog.thunks';

describe('catalog thunks', () => {
  it('should load the products from the api', async () => {
    const services = createFakeServices();
    services.api.listProducts.mockResolvedValue(ok([aProduct()]));
    const store = createAppStore(services);

    await store.dispatch(fetchProducts());

    expect(store.getState().catalog).toMatchObject({ status: 'succeeded', items: [aProduct()] });
  });

  it('should translate api errors for the UI', async () => {
    const services = createFakeServices();
    services.api.listProducts.mockResolvedValue(
      err({ code: 'NETWORK_ERROR', status: null, detail: null }),
    );
    const store = createAppStore(services);

    await store.dispatch(fetchProducts());

    expect(store.getState().catalog.error?.code).toBe('NETWORK_ERROR');
    expect(store.getState().catalog.error?.message).toMatch(/conexión/);
  });

  it('should refresh the stock of the purchased product', async () => {
    const services = createFakeServices();
    services.api.listProducts.mockResolvedValue(ok([aProduct({ stock: 5 })]));
    services.api.getProductStock.mockResolvedValue(
      ok({ productId: aProduct().id, available: 4, updatedAt: '2026-10-01T15:00:00Z' }),
    );
    const store = createAppStore(services);
    await store.dispatch(fetchProducts());

    await store.dispatch(refreshProductStock(aProduct().id));

    expect(store.getState().catalog.items[0]?.stock).toBe(4);
    expect(services.api.getProductStock).toHaveBeenCalledWith(aProduct().id);
  });

  it('should reject the stock refresh with a ui error', async () => {
    const services = createFakeServices();
    services.api.getProductStock.mockResolvedValue(
      err({ code: 'PRODUCT_NOT_FOUND', status: 404, detail: null }),
    );

    const action = await createAppStore(services).dispatch(refreshProductStock(aProduct().id));

    expect(action.payload).toEqual({ code: 'PRODUCT_NOT_FOUND', message: expect.any(String) });
  });
});
