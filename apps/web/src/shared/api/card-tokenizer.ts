import { z } from 'zod';
import { type Clock } from '../lib/ports';
import { AsyncResult, err, ok } from '../lib/result';
import { apiError, type FetchFn, readJson, sendRequest } from './http';
import { type ApiResult, type CardInput, type CardToken, type CardTokenizer } from './ports';

export const CARD_REJECTED = 'CARD_REJECTED';

/** Used when the gateway does not say when the token expires (conservative). */
export const FALLBACK_TOKEN_TTL_MS = 10 * 60_000;

const tokenResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    brand: z.string(),
    last_four: z.string().length(4),
    expires_at: z.string().optional(),
  }),
});

export interface GatewayTokenizerConfig {
  readonly baseUrl: string;
  readonly publicKey: string;
}

/**
 * Tokenizes the card directly against the payment gateway with the PUBLIC key (ADR-002): the card
 * number, CVC and expiry never reach our API, logs or storage.
 */
export class GatewayCardTokenizer implements CardTokenizer {
  constructor(
    private readonly config: GatewayTokenizerConfig,
    private readonly clock: Clock,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
  ) {}

  async tokenize(card: CardInput): ApiResult<CardToken> {
    return await AsyncResult.from(
      sendRequest(this.fetchFn, {
        url: `${this.config.baseUrl}/tokens/cards`,
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.publicKey}` },
        body: {
          number: card.number,
          cvc: card.cvc,
          exp_month: card.expMonth,
          exp_year: card.expYear,
          card_holder: card.holderName,
        },
      }),
    ).andThen(async (response) => {
      if (response.status >= 400 && response.status < 500)
        return err(apiError(CARD_REJECTED, response.status));
      if (!response.ok) return err(apiError(`HTTP_${response.status}`, response.status));
      const body = await readJson(response, tokenResponseSchema);
      return body.ok ? ok(this.toCardToken(body.value.data)) : body;
    });
  }

  private toCardToken(data: z.infer<typeof tokenResponseSchema>['data']): CardToken {
    const expiresAt = data.expires_at ? Date.parse(data.expires_at) : Number.NaN;
    return {
      token: data.id,
      brand: data.brand,
      lastFour: data.last_four,
      expiresAt: Number.isNaN(expiresAt) ? this.clock.now() + FALLBACK_TOKEN_TTL_MS : expiresAt,
    };
  }
}
