import { aProduct } from '@test/builders';
import { catalogSlice, initialCatalogState, productStockUpdated } from './catalog.slice';
import { fetchProducts, refreshProductStock } from './catalog.thunks';

const reduce = catalogSlice.reducer;
const loaded = reduce(
  initialCatalogState,
  fetchProducts.fulfilled([aProduct({ stock: 5 })], 'req'),
);

describe('catalog reducer', () => {
  it('should start idle and empty', () => {
    expect(reduce(undefined, { type: 'unknown' })).toEqual(initialCatalogState);
  });

  it('should track the loading lifecycle of fetchProducts', () => {
    const loading = reduce(initialCatalogState, fetchProducts.pending('req'));

    expect(loading.status).toBe('loading');
    expect(loaded).toEqual({ items: [aProduct({ stock: 5 })], status: 'succeeded', error: null });
  });

  it('should keep the error when loading fails and clear it on retry', () => {
    const failed = reduce(
      initialCatalogState,
      fetchProducts.rejected(null, 'req', undefined, { code: 'NETWORK_ERROR', message: 'offline' }),
    );

    expect(failed).toMatchObject({ status: 'failed', error: { code: 'NETWORK_ERROR' } });
    expect(reduce(failed, fetchProducts.pending('req')).error).toBeNull();
  });

  it('should keep a generic error when the thunk throws unexpectedly', () => {
    const failed = reduce(initialCatalogState, fetchProducts.rejected(new Error('bug'), 'req'));

    expect(failed.error).toEqual({ code: 'UNKNOWN', message: 'bug' });
  });

  it('should update the stock of a known product and ignore unknown ones', () => {
    const updated = reduce(loaded, productStockUpdated({ productId: aProduct().id, available: 3 }));
    const refreshed = reduce(
      loaded,
      refreshProductStock.fulfilled({ productId: aProduct().id, available: 1 }, 'r', 'x'),
    );
    const untouched = reduce(loaded, productStockUpdated({ productId: 'other', available: 1 }));

    expect(updated.items[0]?.stock).toBe(3);
    expect(refreshed.items[0]?.stock).toBe(1);
    expect(untouched).toEqual(loaded);
  });
});
