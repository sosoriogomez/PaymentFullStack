import { aDelivery, aTransaction } from '@test/builders';
import { checkoutReset, retryWithAnotherCard } from '@/features/checkout/checkout.actions';
import {
  deliveryLoaded,
  initialTransactionState,
  pollingStarted,
  pollingStopped,
  pollingTimedOut,
  transactionSlice,
  transactionUpdated,
} from './transaction.slice';
import { fetchDelivery, fetchTransaction } from './transaction.thunks';

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

  it('should stop polling once the status is final', () => {
    const active = reduce(initialTransactionState, pollingStarted({ transactionId: 't1' }));

    expect(reduce(active, transactionUpdated(aTransaction())).polling).toBe('active');
    expect(reduce(active, transactionUpdated(aTransaction({ status: 'DECLINED' }))).polling).toBe(
      'idle',
    );
  });

  it('should track loading by id and forget the delivery of another transaction', () => {
    const withDelivery = { ...initialTransactionState, delivery: aDelivery() };
    const loading = reduce(withDelivery, { type: fetchTransaction.pending.type });
    const other = aTransaction({ id: 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b' });
    const loaded = reduce(loading, { type: fetchTransaction.fulfilled.type, payload: other });
    const failed = reduce(loading, {
      type: fetchTransaction.rejected.type,
      payload: { code: 'TRANSACTION_NOT_FOUND', message: 'x' },
    });

    expect(loading.load.status).toBe('loading');
    expect(loaded).toMatchObject({ current: other, delivery: null, load: { status: 'succeeded' } });
    expect(failed.load).toEqual({
      status: 'failed',
      error: { code: 'TRANSACTION_NOT_FOUND', message: 'x' },
    });
    expect(
      reduce(loading, { type: fetchTransaction.rejected.type, error: { message: 'boom' } }).load
        .error,
    ).toEqual({ code: 'UNKNOWN', message: 'boom' });
  });

  it('should keep the delivery when the same transaction is loaded again', () => {
    const state = { ...initialTransactionState, current: aTransaction(), delivery: aDelivery() };

    const loaded = reduce(state, {
      type: fetchTransaction.fulfilled.type,
      payload: aTransaction(),
    });

    expect(loaded.delivery).toEqual(aDelivery());
  });

  it('should store the delivery and be cleared when retrying with another card', () => {
    const state = reduce(initialTransactionState, {
      type: fetchDelivery.fulfilled.type,
      payload: aDelivery(),
    });

    expect(state.delivery).toEqual(aDelivery());
    expect(reduce(state, retryWithAnotherCard({ productId: 'p1', quantity: 1 }))).toEqual(
      initialTransactionState,
    );
  });
});
