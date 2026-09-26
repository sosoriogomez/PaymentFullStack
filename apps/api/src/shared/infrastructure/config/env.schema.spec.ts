import { testEnv } from '../../../../test/support/test-env';
import { InvalidEnvironmentError, parseEnv } from './env.schema';

describe('parseEnv', () => {
  it('should apply defaults when optional values are missing', () => {
    const env = parseEnv(testEnv());

    expect(env.PORT).toBe(3000);
    expect(env.PG_POST_TIMEOUT_MS).toBe(8000);
    expect(env.BASE_FEE_IN_CENTS).toBe(300_000);
    expect(env.DELIVERY_FEE_IN_CENTS).toBe(1_000_000);
    expect(env.CURRENCY).toBe('COP');
    expect(env.CORS_ALLOWED_ORIGINS).toEqual([]);
  });

  it('should coerce numeric values and split comma separated lists', () => {
    const env = parseEnv(
      testEnv({ PORT: '8080', CORS_ALLOWED_ORIGINS: 'http://localhost:5173, https://app.test ,' }),
    );

    expect(env.PORT).toBe(8080);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:5173', 'https://app.test']);
  });

  it('should fail naming the variable when a required secret is missing', () => {
    expect(() => parseEnv(testEnv({ PG_PRIVATE_KEY: undefined }))).toThrow(InvalidEnvironmentError);
    expect(() => parseEnv(testEnv({ PG_PRIVATE_KEY: undefined }))).toThrow(/PG_PRIVATE_KEY/);
  });

  it('should treat empty strings as missing values', () => {
    expect(() => parseEnv(testEnv({ PG_PRIVATE_KEY: '' }))).toThrow(/PG_PRIVATE_KEY/);
  });

  it('should reject non integer numeric values', () => {
    expect(() => parseEnv(testEnv({ BASE_FEE_IN_CENTS: '10.5' }))).toThrow(/BASE_FEE_IN_CENTS/);
  });

  it('should require database settings', () => {
    expect(() => parseEnv(testEnv({ DATABASE_URL: undefined }))).toThrow(/DATABASE_URL/);
  });

  it('should accept discrete database settings instead of a url', () => {
    const env = parseEnv(
      testEnv({
        DATABASE_URL: undefined,
        DB_HOST: 'db',
        DB_NAME: 'checkout',
        DB_USER: 'u',
        DB_PASSWORD: 'p',
      }),
    );

    expect(env.DB_HOST).toBe('db');
    expect(env.DB_PORT).toBe(5432);
  });

  it('should accept an optional origin verify secret of at least 16 characters', () => {
    expect(
      parseEnv(testEnv({ APP_ENV: 'aws', ORIGIN_VERIFY_SECRET: 'a'.repeat(32) }))
        .ORIGIN_VERIFY_SECRET,
    ).toHaveLength(32);
    expect(() => parseEnv(testEnv({ ORIGIN_VERIFY_SECRET: 'short' }))).toThrow(
      /ORIGIN_VERIFY_SECRET/,
    );
  });
});
