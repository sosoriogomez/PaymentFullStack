import { aProduct } from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { createAppStore } from '@/app/store';
import { selectCatalog, selectProductById } from './catalog.selectors';

describe('catalog selectors', () => {
  const store = createAppStore(createFakeServices(), {
    catalog: { items: [aProduct()], status: 'succeeded', error: null },
  });

  it('should find a product by id', () => {
    expect(selectProductById(store.getState(), aProduct().id)).toEqual(aProduct());
    expect(selectProductById(store.getState(), 'missing')).toBeNull();
    expect(selectProductById(store.getState(), null)).toBeNull();
  });

  it('should expose the catalog slice', () => {
    expect(selectCatalog(store.getState()).status).toBe('succeeded');
  });
});
