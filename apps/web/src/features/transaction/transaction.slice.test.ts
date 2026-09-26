import { aDelivery, aTransaction } from '@test/builders';
import { checkoutReset } from '@/features/checkout/checkout.actions';
import {
  deliveryLoaded,
  initialTransactionState,
  pollingStarted,
  pollingStopped,
  pollingTimedOut,
  transactionSlice,
  transactionUpdated,
} from './transaction.slice';

const reduce = transactionSlice.reducer;

describe('transaction reducer', () => {
  it('should store the latest transaction and its delivery', () => {
    const state = reduce(
      reduce(initialTransactionState, transactionUpdated(aTransaction())),
      deliveryLoaded(aDelivery()),
    );

    expect(state.current).toEqual(aTransaction());
    expect(state.delivery).toEqual(aDelivery());
  });

  it('should track the polling lifecycle', () => {
    const active = reduce(initialTransactionState, pollingStarted({ transactionId: 't1' }));

    expect(active.polling).toBe('active');
    expect(reduce(active, pollingTimedOut()).polling).toBe('timeout');
    expect(reduce(active, pollingStopped()).polling).toBe('idle');
  });

  it('should be cleared when the checkout is reset', () => {
    const state = reduce(initialTransactionState, transactionUpdated(aTransaction()));

    expect(reduce(state, checkoutReset())).toEqual(initialTransactionState);
  });
});
