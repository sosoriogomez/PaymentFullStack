import { aTransaction, TRANSACTION_ID } from '@test/builders';
import { createFakeServices, type FakeServices } from '@test/fakes/fake-services';
import { createAppStore } from '@/app/store';
import { checkoutReset } from '@/features/checkout/checkout.actions';
import { err, ok } from '@/shared/lib/result';
import { POLLING_MAX_MS, registerPollingListener } from './polling.listener';
import { pollingStarted, pollingStopped } from './transaction.slice';

const pending = ok(aTransaction({ status: 'PENDING' }));
const approved = ok(aTransaction({ status: 'APPROVED' }));

const setup = () => {
  const services: FakeServices = createFakeServices();
  services.api.getTransaction.mockResolvedValue(pending);
  const store = createAppStore(services, undefined, [registerPollingListener]);
  const start = () => store.dispatch(pollingStarted({ transactionId: TRANSACTION_ID }));
  const calls = () => services.api.getTransaction.mock.calls.length;
  return { store, services, start, calls };
};

describe('polling listener', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should poll at 2 s, 2 s, 3 s, 3 s and then every 5 s', async () => {
    const { start, calls } = setup();
    start();

    const timeline: number[] = [];
    for (const ms of [1999, 1, 2000, 3000, 3000, 5000, 5000]) {
      await jest.advanceTimersByTimeAsync(ms);
      timeline.push(calls());
    }

    expect(timeline).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('should stop as soon as the transaction reaches a final status', async () => {
    const { store, services, start, calls } = setup();
    services.api.getTransaction.mockResolvedValueOnce(pending).mockResolvedValueOnce(approved);
    start();

    await jest.advanceTimersByTimeAsync(4000);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(calls()).toBe(2);
    expect(store.getState().transaction).toMatchObject({
      polling: 'idle',
      current: { status: 'APPROVED' },
    });
  });

  it('should keep polling after a failed request', async () => {
    const { store, services, start } = setup();
    services.api.getTransaction
      .mockResolvedValueOnce(err({ code: 'NETWORK_ERROR', status: null, detail: null }))
      .mockResolvedValueOnce(approved);
    start();

    await jest.advanceTimersByTimeAsync(4000);

    expect(store.getState().transaction.current?.status).toBe('APPROVED');
  });

  it('should give up after 90 s of waiting and offer to check again', async () => {
    const { store, start, calls } = setup();
    start();

    await jest.advanceTimersByTimeAsync(POLLING_MAX_MS);
    const callsAtTimeout = calls();
    await jest.advanceTimersByTimeAsync(30_000);

    expect(store.getState().transaction.polling).toBe('timeout');
    expect(calls()).toBe(callsAtTimeout);
    expect(callsAtTimeout).toBe(20);
  });

  it('should not ask the API while the page is hidden', async () => {
    const { services, start, calls } = setup();
    services.pageVisibility.hidden = true;
    start();

    await jest.advanceTimersByTimeAsync(30_000);
    expect(calls()).toBe(0);

    services.pageVisibility.show();
    await jest.advanceTimersByTimeAsync(0);
    expect(calls()).toBe(1);
  });

  it.each([
    ['the page is left', pollingStopped()],
    ['the checkout is reset', checkoutReset()],
  ])('should stop when %s', async (_, action) => {
    const { store, start, calls } = setup();
    start();
    await jest.advanceTimersByTimeAsync(2000);

    store.dispatch(action);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(calls()).toBe(1);
  });

  it('should restart from scratch when polling starts again', async () => {
    const { start, calls } = setup();
    start();
    await jest.advanceTimersByTimeAsync(1000);

    start();
    await jest.advanceTimersByTimeAsync(1500);
    expect(calls()).toBe(0);
    await jest.advanceTimersByTimeAsync(500);
    expect(calls()).toBe(1);
  });
});
