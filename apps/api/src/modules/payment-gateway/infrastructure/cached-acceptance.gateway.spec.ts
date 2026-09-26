import { err, ok } from '../../../shared/kernel/result';
import { type PaymentGateway } from '../domain/payment-gateway.port';
import { CachedAcceptanceGateway } from './cached-acceptance.gateway';

const tokens = {
  acceptanceToken: 'a',
  acceptancePermalink: 'https://gateway.test/a.pdf',
  personalDataAuthToken: 'p',
  personalDataAuthPermalink: 'https://gateway.test/p.pdf',
};

const innerGateway = (): jest.Mocked<PaymentGateway> => ({
  getAcceptanceTokens: jest.fn(() => Promise.resolve(ok(tokens))),
  createCardTransaction: jest.fn(),
  getTransaction: jest.fn(),
  findTransactionByReference: jest.fn(),
});

describe('CachedAcceptanceGateway', () => {
  let now = 0;
  const clock = { now: () => new Date(now) };

  beforeEach(() => {
    now = 1_000;
  });

  it('should reuse the tokens during the TTL and refresh them afterwards', async () => {
    const inner = innerGateway();
    const gateway = new CachedAcceptanceGateway(inner, clock, 300_000);

    await gateway.getAcceptanceTokens();
    now += 299_999;
    await gateway.getAcceptanceTokens();
    expect(inner.getAcceptanceTokens).toHaveBeenCalledTimes(1);

    now += 1;
    expect(await gateway.getAcceptanceTokens()).toEqual(ok(tokens));
    expect(inner.getAcceptanceTokens).toHaveBeenCalledTimes(2);
  });

  it('should not cache failures', async () => {
    const inner = innerGateway();
    inner.getAcceptanceTokens.mockResolvedValueOnce(
      err({ code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' }),
    );
    const gateway = new CachedAcceptanceGateway(inner, clock, 300_000);

    expect((await gateway.getAcceptanceTokens()).ok).toBe(false);
    expect((await gateway.getAcceptanceTokens()).ok).toBe(true);
    expect(inner.getAcceptanceTokens).toHaveBeenCalledTimes(2);
  });

  it('should delegate every other operation', async () => {
    const inner = innerGateway();
    const gateway = new CachedAcceptanceGateway(inner, clock, 1);
    const request = {} as Parameters<PaymentGateway['createCardTransaction']>[0];

    await gateway.createCardTransaction(request);
    await gateway.getTransaction('id');
    await gateway.findTransactionByReference('ref');

    expect(inner.createCardTransaction).toHaveBeenCalledWith(request);
    expect(inner.getTransaction).toHaveBeenCalledWith('id');
    expect(inner.findTransactionByReference).toHaveBeenCalledWith('ref');
  });
});
