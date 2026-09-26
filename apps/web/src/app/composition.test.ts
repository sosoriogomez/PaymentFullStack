import { GatewayCardTokenizer } from '@/shared/api/card-tokenizer';
import { HttpCheckoutApi } from '@/shared/api/checkout-api';
import { SafeLocalStorage, systemClock } from '@/shared/lib/browser-adapters';
import { createBrowserServices } from './composition';

describe('createBrowserServices', () => {
  it('should wire the browser adapters to every port', () => {
    const services = createBrowserServices({
      apiBaseUrl: '/api',
      pgBaseUrl: 'https://gateway.test/v1',
      pgPublicKey: 'pub',
      isDevelopment: false,
    });

    expect(services.api).toBeInstanceOf(HttpCheckoutApi);
    expect(services.cardTokenizer).toBeInstanceOf(GatewayCardTokenizer);
    expect(services.storage).toBeInstanceOf(SafeLocalStorage);
    expect(services.clock).toBe(systemClock);
    expect(services.idGenerator.uuid()).toMatch(/^[0-9a-f-]{36}$/);
    expect(services.pageVisibility.isHidden()).toBe(false);
  });
});
