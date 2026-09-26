import { z } from 'zod';

const integer = (min: number) => z.coerce.number().int().min(min);

const commaSeparatedList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'aws']).default('local'),
    PORT: integer(1).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ALLOWED_ORIGINS: commaSeparatedList,
    ORIGIN_VERIFY_SECRET: z.string().min(16).optional(),

    DATABASE_URL: z.url().optional(),
    DB_HOST: z.string().optional(),
    DB_PORT: integer(1).default(5432),
    DB_NAME: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_SSL_CA_PATH: z.string().optional(),
    DB_POOL_MAX: integer(1).default(2),

    PG_BASE_URL: z.url(),
    PG_PUBLIC_KEY: z.string().min(1),
    PG_PRIVATE_KEY: z.string().min(1),
    PG_INTEGRITY_SECRET: z.string().min(1),
    PG_EVENTS_SECRET: z.string().min(1),
    PG_POST_TIMEOUT_MS: integer(1).default(8000),
    PG_GET_TIMEOUT_MS: integer(1).default(4000),
    PG_GET_MAX_RETRIES: integer(0).default(2),
    PG_DEADLINE_MS: integer(1).default(12000),
    ACCEPTANCE_CACHE_TTL_SECONDS: integer(0).default(300),

    BASE_FEE_IN_CENTS: integer(0).default(300_000),
    DELIVERY_FEE_IN_CENTS: integer(0).default(1_000_000),
    CURRENCY: z.literal('COP').default('COP'),

    RECONCILE_MIN_AGE_SECONDS: integer(0).default(60),
    RECONCILE_BATCH_SIZE: integer(1).default(25),
    PENDING_EXPIRATION_MINUTES: integer(1).default(15),
  })
  .superRefine((env, ctx) => {
    const hasDiscreteDbSettings = Boolean(
      env.DB_HOST && env.DB_NAME && env.DB_USER && env.DB_PASSWORD,
    );
    if (!env.DATABASE_URL && !hasDiscreteDbSettings) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Set DATABASE_URL or DB_HOST, DB_NAME, DB_USER and DB_PASSWORD',
      });
    }
    if (env.APP_ENV === 'aws' && !env.ORIGIN_VERIFY_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['ORIGIN_VERIFY_SECRET'],
        message: 'Required when APP_ENV=aws',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  override readonly name = 'InvalidEnvironmentError';
}

/** Empty strings (e.g. `KEY=` in a .env file) are treated as missing values. */
const withoutEmptyValues = (source: Readonly<Record<string, string | undefined>>) =>
  Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(withoutEmptyValues(source));
  if (!result.success) {
    throw new InvalidEnvironmentError(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
