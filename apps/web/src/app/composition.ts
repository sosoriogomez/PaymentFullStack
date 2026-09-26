import { GatewayCardTokenizer } from '@/shared/api/card-tokenizer';
import { HttpCheckoutApi } from '@/shared/api/checkout-api';
import { HttpClient } from '@/shared/api/http-client';
import { type AppEnv } from '@/shared/config/env.schema';
import {
  cryptoIdGenerator,
  documentVisibility,
  SafeLocalStorage,
  systemClock,
} from '@/shared/lib/browser-adapters';
import { type AppServices } from './services';

/** Composition root: the only place that chooses concrete adapters for the ports. */
export function createBrowserServices(env: AppEnv): AppServices {
  return {
    api: new HttpCheckoutApi(new HttpClient(`${env.apiBaseUrl}/v1`)),
    cardTokenizer: new GatewayCardTokenizer(
      { baseUrl: env.pgBaseUrl, publicKey: env.pgPublicKey },
      systemClock,
    ),
    storage: new SafeLocalStorage(),
    idGenerator: cryptoIdGenerator,
    clock: systemClock,
    pageVisibility: documentVisibility(),
  };
}
