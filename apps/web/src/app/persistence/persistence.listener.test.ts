import { PRODUCT_ID } from '@test/builders';
import { createFakeServices } from '@test/fakes/fake-services';
import { createAppStore } from '@/app/store';
import { checkoutReset } from '@/features/checkout/checkout.actions';
import { checkoutStarted, contactDraftUpdated } from '@/features/checkout/checkout.slice';
import { productStockUpdated } from '@/features/catalog/catalog.slice';
import { STORAGE_KEY } from './persisted-state';
import { PERSIST_DEBOUNCE_MS, registerPersistenceListener } from './persistence.listener';

describe('persistence listener', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setup = () => {
    const services = createFakeServices();
    const setItem = jest.spyOn(services.storage, 'setItem');
    const store = createAppStore(services, undefined, [registerPersistenceListener]);
    return { store, services, setItem };
  };

  it('should save once, 300 ms after the last checkout change', async () => {
    const { store, setItem } = setup();

    store.dispatch(checkoutStarted({ productId: PRODUCT_ID, quantity: 1 }));
    await jest.advanceTimersByTimeAsync(200);
    store.dispatch(contactDraftUpdated({ fullName: 'Ana Pérez' }));
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS - 1);
    expect(setItem).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0]?.[1]).toContain('Ana Pérez');
  });

  it('should ignore actions of other slices', async () => {
    const { store, setItem } = setup();

    store.dispatch(productStockUpdated({ productId: PRODUCT_ID, available: 1 }));
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

    expect(setItem).not.toHaveBeenCalled();
  });

  it('should forget the checkout when going back to the store', async () => {
    const { store, services } = setup();
    store.dispatch(checkoutStarted({ productId: PRODUCT_ID, quantity: 1 }));
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    expect(services.storage.getItem(STORAGE_KEY)).not.toBeNull();

    store.dispatch(checkoutReset());
    await jest.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);

    expect(services.storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
