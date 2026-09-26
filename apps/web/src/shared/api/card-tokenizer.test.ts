/** @jest-environment node */
import { FixedClock } from '@test/fakes/fake-services';
import { fakeFetch, jsonResponse, lastCall } from '@test/support/fake-fetch';
import { err, ok } from '../lib/result';
import { FALLBACK_TOKEN_TTL_MS, GatewayCardTokenizer } from './card-tokenizer';

const card = {
  number: '4242424242424242',
  cvc: '123',
  expMonth: '08',
  expYear: '29',
  holderName: 'ANA PEREZ',
};
const config = { baseUrl: 'https://gateway.test/v1', publicKey: 'pub-key' };

const tokenResponse = (data: Record<string, unknown>) =>
  jsonResponse(201, {
    status: 'CREATED',
    data: { id: 'tok_test_1', brand: 'VISA', last_four: '4242', ...data },
  });

describe('GatewayCardTokenizer', () => {
  it('should send the card only to the gateway with the public key', async () => {
    const fetchFn = fakeFetch(tokenResponse({ expires_at: '2026-10-01T15:30:00.000Z' }));

    const result = await new GatewayCardTokenizer(config, new FixedClock(), fetchFn).tokenize(card);

    expect(result).toEqual(
      ok({
        token: 'tok_test_1',
        brand: 'VISA',
        lastFour: '4242',
        expiresAt: Date.parse('2026-10-01T15:30:00.000Z'),
      }),
    );
    expect(lastCall(fetchFn)).toMatchObject({
      url: 'https://gateway.test/v1/tokens/cards',
      init: { method: 'POST', headers: { Authorization: 'Bearer pub-key' } },
      body: {
        number: card.number,
        cvc: '123',
        exp_month: '08',
        exp_year: '29',
        card_holder: 'ANA PEREZ',
      },
    });
  });

  it('should assume a conservative expiry when the gateway does not send one', async () => {
    const clock = new FixedClock(1_000);

    const result = await new GatewayCardTokenizer(
      config,
      clock,
      fakeFetch(tokenResponse({})),
    ).tokenize(card);

    expect(result.ok && result.value.expiresAt).toBe(1_000 + FALLBACK_TOKEN_TTL_MS);
  });

  it('should report rejected card data', async () => {
    const rejected = jsonResponse(422, { error: { type: 'INPUT_VALIDATION_ERROR' } });

    const result = await new GatewayCardTokenizer(
      config,
      new FixedClock(),
      fakeFetch(rejected),
    ).tokenize(card);

    expect(result).toEqual(err({ code: 'CARD_REJECTED', status: 422, detail: null }));
  });

  it('should report gateway failures and unexpected bodies', async () => {
    const tokenizer = new GatewayCardTokenizer(
      config,
      new FixedClock(),
      fakeFetch(
        jsonResponse(503, {}),
        jsonResponse(201, { data: { id: '' } }),
        new TypeError('offline'),
      ),
    );

    expect(await tokenizer.tokenize(card)).toEqual(
      err({ code: 'HTTP_503', status: 503, detail: null }),
    );
    expect(await tokenizer.tokenize(card)).toEqual(
      err({ code: 'INVALID_RESPONSE', status: 201, detail: null }),
    );
    expect(await tokenizer.tokenize(card)).toEqual(
      err({ code: 'NETWORK_ERROR', status: null, detail: null }),
    );
  });
});
