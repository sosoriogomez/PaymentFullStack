import { z } from 'zod';

/** Where secrets come from (SSM Parameter Store and Secrets Manager in AWS; fakes in tests). */
export interface SecretSources {
  /** Returns the decrypted value of each parameter found, keyed by its full name. */
  getParameters(names: readonly string[]): Promise<Record<string, string>>;
  getSecretString(secretId: string): Promise<string>;
}

type Env = Record<string, string | undefined>;

/** SSM parameters under `SSM_PARAMETER_PREFIX` and the variable each one fills. */
export const GATEWAY_PARAMETERS = {
  'pg/base-url': 'PG_BASE_URL',
  'pg/public-key': 'PG_PUBLIC_KEY',
  'pg/private-key': 'PG_PRIVATE_KEY',
  'pg/integrity-secret': 'PG_INTEGRITY_SECRET',
  'pg/events-secret': 'PG_EVENTS_SECRET',
} as const;

/** Shape of the secret that RDS generates for the database credentials. */
const databaseSecretSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  dbname: z.string().min(1).optional(),
});

async function loadGatewayParameters(
  env: Env,
  prefix: string,
  sources: SecretSources,
): Promise<void> {
  const names = Object.keys(GATEWAY_PARAMETERS).map((suffix) => `${prefix}/${suffix}`);
  const values = await sources.getParameters(names);
  const missing = names.filter((name) => values[name] === undefined);
  if (missing.length > 0) throw new Error(`Missing SSM parameters: ${missing.join(', ')}`);
  for (const [suffix, variable] of Object.entries(GATEWAY_PARAMETERS)) {
    env[variable] = values[`${prefix}/${suffix}`];
  }
}

async function loadDatabaseSecret(
  env: Env,
  secretId: string,
  sources: SecretSources,
): Promise<void> {
  const secret = databaseSecretSchema.parse(JSON.parse(await sources.getSecretString(secretId)));
  env.DB_HOST = secret.host;
  env.DB_PORT = String(secret.port);
  env.DB_USER = secret.username;
  env.DB_PASSWORD = secret.password;
  if (secret.dbname) env.DB_NAME = secret.dbname;
}

/**
 * Fills the environment with the secrets configured through `SSM_PARAMETER_PREFIX`,
 * `DB_SECRET_ARN` and `ORIGIN_VERIFY_SECRET_ARN`, once per cold start and before the app
 * validates its configuration. Nothing configured → nothing loaded (local runs).
 */
export async function loadSecretsIntoEnv(env: Env, sources: SecretSources): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (env.SSM_PARAMETER_PREFIX)
    tasks.push(loadGatewayParameters(env, env.SSM_PARAMETER_PREFIX, sources));
  if (env.DB_SECRET_ARN) tasks.push(loadDatabaseSecret(env, env.DB_SECRET_ARN, sources));
  const originSecretArn = env.ORIGIN_VERIFY_SECRET_ARN;
  if (originSecretArn) {
    tasks.push(
      sources.getSecretString(originSecretArn).then((value) => {
        env.ORIGIN_VERIFY_SECRET = value;
      }),
    );
  }
  await Promise.all(tasks);
}
