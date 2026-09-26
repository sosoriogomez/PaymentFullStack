import { createFakeServices } from '@test/fakes/fake-services';
import { checkoutStarted } from '@/features/checkout/checkout.slice';
import { createAppStore } from './store';

describe('createAppStore', () => {
  it('should combine the catalog, checkout and transaction slices', () => {
    const store = createAppStore(createFakeServices());

    expect(Object.keys(store.getState())).toEqual(['catalog', 'checkout', 'transaction']);
  });

  it('should accept a preloaded state', () => {
    const initial = createAppStore(createFakeServices()).getState();
    const store = createAppStore(createFakeServices(), {
      checkout: { ...initial.checkout, step: 'SUMMARY' },
    });

    expect(store.getState().checkout.step).toBe('SUMMARY');
  });

  it('should inject the services into thunks', () => {
    const services = createFakeServices();
    const store = createAppStore(services);

    const seen = store.dispatch((_dispatch, _getState, extra) => extra);

    expect(seen).toBe(services);
  });

  it('should register listeners on its own middleware', () => {
    const effect = jest.fn();
    const store = createAppStore(createFakeServices(), undefined, [
      (startListening) => startListening({ actionCreator: checkoutStarted, effect }),
    ]);

    store.dispatch(checkoutStarted({ productId: 'p1', quantity: 1 }));

    expect(effect).toHaveBeenCalledTimes(1);
  });
});
