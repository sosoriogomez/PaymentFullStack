import { aProduct } from '@test/builders';
import {
  catalogSlice,
  initialCatalogState,
  productsFailed,
  productsLoaded,
  productsRequested,
  productStockUpdated,
} from './catalog.slice';

const reduce = catalogSlice.reducer;

describe('catalog reducer', () => {
  it('should start idle and empty', () => {
    expect(reduce(undefined, { type: 'unknown' })).toEqual(initialCatalogState);
  });

  it('should track the loading lifecycle', () => {
    const loading = reduce(initialCatalogState, productsRequested());
    const loaded = reduce(loading, productsLoaded([aProduct()]));

    expect(loading.status).toBe('loading');
    expect(loaded).toEqual({ items: [aProduct()], status: 'succeeded', error: null });
  });

  it('should keep the error when loading fails and clear it on retry', () => {
    const failed = reduce(
      initialCatalogState,
      productsFailed({ code: 'NETWORK_ERROR', message: 'offline' }),
    );

    expect(failed).toMatchObject({ status: 'failed', error: { code: 'NETWORK_ERROR' } });
    expect(reduce(failed, productsRequested()).error).toBeNull();
  });

  it('should update the stock of a known product and ignore unknown ones', () => {
    const state = reduce(initialCatalogState, productsLoaded([aProduct({ stock: 5 })]));

    const updated = reduce(state, productStockUpdated({ productId: aProduct().id, available: 3 }));
    const untouched = reduce(state, productStockUpdated({ productId: 'other', available: 1 }));

    expect(updated.items[0]?.stock).toBe(3);
    expect(untouched).toEqual(state);
  });
});
