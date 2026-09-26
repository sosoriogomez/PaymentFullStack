import { testEnv } from '../../../../test/support/test-env';
import { AppConfigService } from './app-config.service';
import { parseEnv } from './env.schema';

describe('AppConfigService', () => {
  const configFor = (overrides: Record<string, string | undefined> = {}) =>
    new AppConfigService(parseEnv(testEnv(overrides)));

  it('should group the gateway settings and trim the trailing slash of the base url', () => {
    const config = configFor({ PG_BASE_URL: 'https://gateway.test/v1/' });

    expect(config.paymentGateway).toMatchObject({
      baseUrl: 'https://gateway.test/v1',
      publicKey: 'test-public-key',
      postTimeoutMs: 8000,
      getTimeoutMs: 4000,
      getMaxRetries: 2,
      deadlineMs: 12000,
    });
  });

  it('should expose whether it runs on aws', () => {
    expect(configFor().app.isAws).toBe(false);
    expect(configFor({ APP_ENV: 'aws', ORIGIN_VERIFY_SECRET: 'x'.repeat(20) }).app.isAws).toBe(
      true,
    );
  });

  it('should expose pricing and reconciliation settings', () => {
    const config = configFor();

    expect(config.pricing).toEqual({
      baseFeeInCents: 300_000,
      deliveryFeeInCents: 1_000_000,
      currency: 'COP',
    });
    expect(config.reconciliation).toEqual({
      minAgeSeconds: 60,
      batchSize: 25,
      pendingExpirationMinutes: 15,
    });
    expect(config.database.poolMax).toBe(2);
  });
});
