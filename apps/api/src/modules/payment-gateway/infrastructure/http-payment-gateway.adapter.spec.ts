import { Logger } from '@nestjs/common';
import {
  type FakeAnswer,
  fakeGatewayFetch,
  fixture,
  json,
} from '../../../../test/support/fake-gateway-fetch';
import { type PaymentGatewaySettings } from '../../../shared/infrastructure/config/app-config.service';
import { err } from '../../../shared/kernel/result';
import { type CardChargeRequest } from '../domain/payment-gateway.port';
import { HttpPaymentGatewayAdapter } from './http-payment-gateway.adapter';

const settings: PaymentGatewaySettings = {
  baseUrl: 'https://gateway.test/v1',
  publicKey: 'public-key',
  privateKey: 'private-key',
  integritySecret: 'test_integrity_secret',
  eventsSecret: 'events',
  postTimeoutMs: 8000,
  getTimeoutMs: 4000,
  getMaxRetries: 2,
  deadlineMs: 12000,
  acceptanceCacheTtlSeconds: 300,
};

const charge: CardChargeRequest = {
  reference: 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W',
  amountInCents: 16_300_000,
  currency: 'COP',
  customerEmail: 'ana@mail.com',
  customer: { fullName: 'Ana Pérez', phone: '3001234567' },
  cardToken: 'tok_test',
  installments: 1,
  acceptanceToken: 'acc',
  acceptPersonalAuth: 'pers',
  shipping: {
    recipientName: 'Ana Pérez',
    recipientPhone: '3001234567',
    addressLine1: 'Cra 43A # 1-50',
    city: 'Medellín',
    region: 'Antioquia',
    country: 'CO',
  },
};

const adapterWith = (answers: FakeAnswer[], overrides: Partial<PaymentGatewaySettings> = {}) => {
  const fetchFn = fakeGatewayFetch(...answers);
  const sleep = jest.fn(() => Promise.resolve());
  const adapter = new HttpPaymentGatewayAdapter(
    { ...settings, ...overrides },
    { fetchFn, sleep, random: () => 0.5 },
  );
  return { adapter, fetchFn, sleep };
};

const callOf = (fetchFn: ReturnType<typeof fakeGatewayFetch>, index = 0) => {
  const [url, init] = fetchFn.mock.calls[index] ?? [];
  return {
    url,
    init,
    headers: init?.headers as Record<string, string>,
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  };
};

// The adapter logs rejections and bad answers on purpose; keep the test output readable.
beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('HttpPaymentGatewayAdapter', () => {
  describe('getAcceptanceTokens', () => {
    it('should read both acceptance tokens and permalinks with the public key in the path', async () => {
      const { adapter, fetchFn } = adapterWith([json(200, fixture('merchant'))]);

      const result = await adapter.getAcceptanceTokens();

      expect(result).toEqual({
        ok: true,
        value: {
          acceptanceToken: 'eyJhbGciOiJIUzI1NiJ9.acceptance.fixture',
          acceptancePermalink: 'https://gateway.test/terms/privacy-policy.pdf',
          personalDataAuthToken: 'eyJhbGciOiJIUzI1NiJ9.personal-data.fixture',
          personalDataAuthPermalink: 'https://gateway.test/terms/personal-data.pdf',
        },
      });
      expect(callOf(fetchFn).url).toBe('https://gateway.test/v1/merchants/public-key');
      expect(callOf(fetchFn).headers.Authorization).toBeUndefined();
    });
  });

  describe('createCardTransaction', () => {
    it('should charge with the private key and a server side integrity signature', async () => {
      const { adapter, fetchFn } = adapterWith([json(201, fixture('transaction-pending'))]);

      const result = await adapter.createCardTransaction(charge);

      expect(result.ok && result.value).toMatchObject({
        id: '15113-1790866800-10001',
        status: 'PENDING',
      });
      const call = callOf(fetchFn);
      expect(call.url).toBe('https://gateway.test/v1/transactions');
      expect(call.init?.method).toBe('POST');
      expect(call.headers.Authorization).toBe('Bearer private-key');
      expect(call.body.signature).toBe(
        'c829289b48e64100867a8e3551fa657e2d2faa837cf49285a8c1b2c29905fadd',
      );
      expect(call.body.payment_method).toEqual({
        type: 'CARD',
        token: 'tok_test',
        installments: 1,
      });
    });

    it('should never retry a charge, even when the gateway fails', async () => {
      const { adapter, fetchFn } = adapterWith([json(502, {})]);

      expect(await adapter.createCardTransaction(charge)).toEqual(
        err({ code: 'GATEWAY_UNAVAILABLE', cause: 'HTTP_5XX' }),
      );
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('should report rejected charges (4xx) with a reason', async () => {
      const { adapter } = adapterWith([json(422, fixture('error-input-validation'))]);

      expect(await adapter.createCardTransaction(charge)).toEqual(
        err({ code: 'GATEWAY_REJECTED', reason: 'INPUT_VALIDATION_ERROR: invalid payment_method' }),
      );
    });

    it('should treat a timeout as an unknown result, not as a failure', async () => {
      const { adapter } = adapterWith(['hang'], { postTimeoutMs: 20 });

      expect(await adapter.createCardTransaction(charge)).toEqual(
        err({ code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' }),
      );
    });

    it('should report network failures', async () => {
      const { adapter } = adapterWith([new TypeError('fetch failed')]);

      expect(await adapter.createCardTransaction(charge)).toEqual(
        err({ code: 'GATEWAY_UNAVAILABLE', cause: 'NETWORK' }),
      );
    });

    it('should reject malformed responses', async () => {
      const notJson = new Response('<html>', { status: 200 });
      const wrongShape = json(201, { data: { id: 1 } });
      const { adapter } = adapterWith([notJson, wrongShape]);

      expect(await adapter.createCardTransaction(charge)).toEqual(
        err({ code: 'GATEWAY_UNAVAILABLE', cause: 'BAD_RESPONSE' }),
      );
      expect(await adapter.createCardTransaction(charge)).toEqual(
        err({ code: 'GATEWAY_UNAVAILABLE', cause: 'BAD_RESPONSE' }),
      );
    });

    it('should summarize 4xx answers without a JSON body', async () => {
      const { adapter } = adapterWith([new Response('Unauthorized', { status: 401 })]);

      expect(await adapter.createCardTransaction(charge)).toEqual(
        err({ code: 'GATEWAY_REJECTED', reason: 'HTTP 401' }),
      );
    });
  });

  describe('getTransaction', () => {
    it('should read the transaction by gateway id', async () => {
      const { adapter, fetchFn } = adapterWith([json(200, fixture('transaction-approved'))]);

      const result = await adapter.getTransaction('15113-1790866800-10001');

      expect(result.ok && result.value.status).toBe('APPROVED');
      expect(callOf(fetchFn).url).toBe(
        'https://gateway.test/v1/transactions/15113-1790866800-10001',
      );
    });

    it('should retry reads with exponential backoff and succeed', async () => {
      const { adapter, fetchFn, sleep } = adapterWith([
        json(503, {}),
        new TypeError('reset'),
        json(200, fixture('transaction-declined')),
      ]);

      const result = await adapter.getTransaction('id');

      expect(result.ok && result.value).toMatchObject({
        status: 'DECLINED',
        statusMessage: 'Fondos insuficientes',
      });
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(sleep).toHaveBeenNthCalledWith(1, 250);
      expect(sleep).toHaveBeenNthCalledWith(2, 450);
    });

    it('should give up after the configured retries', async () => {
      const { adapter, fetchFn } = adapterWith([
        json(500, {}),
        json(500, {}),
        json(500, {}),
        json(200, {}),
      ]);

      expect(await adapter.getTransaction('id')).toEqual(
        err({ code: 'GATEWAY_UNAVAILABLE', cause: 'HTTP_5XX' }),
      );
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('should not retry rejections or malformed responses', async () => {
      const { adapter, fetchFn } = adapterWith([
        json(404, { error: { type: 'NOT_FOUND_ERROR' } }),
        json(200, { data: null }),
      ]);

      expect((await adapter.getTransaction('missing')).ok).toBe(false);
      expect((await adapter.getTransaction('broken')).ok).toBe(false);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('should stop retrying when the total deadline is over', async () => {
      const { adapter, fetchFn } = adapterWith(['hang', 'hang', 'hang'], {
        getTimeoutMs: 1000,
        deadlineMs: 30,
      });

      expect(await adapter.getTransaction('id')).toEqual(
        err({ code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' }),
      );
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('findTransactionByReference', () => {
    it('should return the first transaction with that reference', async () => {
      const { adapter, fetchFn } = adapterWith([json(200, fixture('transactions-by-reference'))]);

      const result = await adapter.findTransactionByReference('TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W');

      expect(result.ok && result.value?.status).toBe('APPROVED');
      expect(callOf(fetchFn).url).toBe(
        'https://gateway.test/v1/transactions?reference=TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W',
      );
      expect(callOf(fetchFn).headers.Authorization).toBe('Bearer private-key');
    });

    it('should return null when the gateway never received the charge', async () => {
      const { adapter } = adapterWith([json(200, { data: [] })]);

      expect(await adapter.findTransactionByReference('TX-unknown')).toEqual({
        ok: true,
        value: null,
      });
    });
  });

  it('should use the real fetch and timers by default', () => {
    expect(new HttpPaymentGatewayAdapter(settings)).toBeInstanceOf(HttpPaymentGatewayAdapter);
  });
});
