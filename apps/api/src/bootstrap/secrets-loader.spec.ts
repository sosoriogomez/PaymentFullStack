import { GATEWAY_PARAMETERS, loadSecretsIntoEnv, type SecretSources } from './secrets-loader';

const PREFIX = '/checkout/prod';
const allParameters = Object.fromEntries(
  Object.keys(GATEWAY_PARAMETERS).map((suffix) => [`${PREFIX}/${suffix}`, `value-of-${suffix}`]),
);
const dbSecret = JSON.stringify({
  username: 'app_admin',
  password: 's3cret',
  host: 'db.internal',
  port: 5432,
  dbname: 'checkout',
});

const fakeSources = (
  parameters: Record<string, string> = allParameters,
  secrets: Record<string, string> = {},
) => {
  const sources: jest.Mocked<SecretSources> = {
    getParameters: jest.fn((names: readonly string[]) =>
      Promise.resolve(
        Object.fromEntries(
          names.flatMap((name) => (parameters[name] ? [[name, parameters[name]]] : [])),
        ),
      ),
    ),
    getSecretString: jest.fn((id: string) =>
      secrets[id] === undefined
        ? Promise.reject(new Error(`no secret ${id}`))
        : Promise.resolve(secrets[id]),
    ),
  };
  return sources;
};

describe('loadSecretsIntoEnv', () => {
  it('should do nothing when no secret source is configured (local runs)', async () => {
    const env: Record<string, string | undefined> = { NODE_ENV: 'development' };
    const sources = fakeSources();

    await loadSecretsIntoEnv(env, sources);

    expect(env).toEqual({ NODE_ENV: 'development' });
    expect(sources.getParameters).not.toHaveBeenCalled();
  });

  it('should load the gateway parameters under the prefix into their variables', async () => {
    const env: Record<string, string | undefined> = { SSM_PARAMETER_PREFIX: PREFIX };

    await loadSecretsIntoEnv(env, fakeSources());

    expect(env).toMatchObject({
      PG_BASE_URL: 'value-of-pg/base-url',
      PG_PUBLIC_KEY: 'value-of-pg/public-key',
      PG_PRIVATE_KEY: 'value-of-pg/private-key',
      PG_INTEGRITY_SECRET: 'value-of-pg/integrity-secret',
      PG_EVENTS_SECRET: 'value-of-pg/events-secret',
    });
  });

  it('should fail naming the parameters that do not exist', async () => {
    const { [`${PREFIX}/pg/private-key`]: _missing, ...incomplete } = allParameters;

    await expect(
      loadSecretsIntoEnv({ SSM_PARAMETER_PREFIX: PREFIX }, fakeSources(incomplete)),
    ).rejects.toThrow('Missing SSM parameters: /checkout/prod/pg/private-key');
  });

  it('should map the RDS generated secret to the discrete database variables', async () => {
    const env: Record<string, string | undefined> = { DB_SECRET_ARN: 'arn:db' };

    await loadSecretsIntoEnv(env, fakeSources({}, { 'arn:db': dbSecret }));

    expect(env).toMatchObject({
      DB_HOST: 'db.internal',
      DB_PORT: '5432',
      DB_USER: 'app_admin',
      DB_PASSWORD: 's3cret',
      DB_NAME: 'checkout',
    });
  });

  it('should keep the configured database name when the secret has none', async () => {
    const env: Record<string, string | undefined> = {
      DB_SECRET_ARN: 'arn:db',
      DB_NAME: 'checkout',
    };
    const withoutName = JSON.stringify({ username: 'u', password: 'p', host: 'h', port: '5432' });

    await loadSecretsIntoEnv(env, fakeSources({}, { 'arn:db': withoutName }));

    expect(env.DB_NAME).toBe('checkout');
  });

  it('should reject a malformed database secret', async () => {
    await expect(
      loadSecretsIntoEnv(
        { DB_SECRET_ARN: 'arn:db' },
        fakeSources({}, { 'arn:db': '{"username":"u"}' }),
      ),
    ).rejects.toThrow();
  });

  it('should load the origin verify secret', async () => {
    const env: Record<string, string | undefined> = { ORIGIN_VERIFY_SECRET_ARN: 'arn:origin' };

    await loadSecretsIntoEnv(env, fakeSources({}, { 'arn:origin': 'x'.repeat(32) }));

    expect(env.ORIGIN_VERIFY_SECRET).toBe('x'.repeat(32));
  });
});
