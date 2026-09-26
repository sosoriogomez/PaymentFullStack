import { type Env } from './env.schema';

export interface AppSettings {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly appEnv: Env['APP_ENV'];
  readonly isAws: boolean;
  readonly port: number;
  readonly logLevel: Env['LOG_LEVEL'];
}

export interface HttpSettings {
  readonly corsAllowedOrigins: readonly string[];
  readonly originVerifySecret: string | undefined;
}

export interface DatabaseSettings {
  readonly url: string | undefined;
  readonly host: string | undefined;
  readonly port: number;
  readonly name: string | undefined;
  readonly user: string | undefined;
  readonly password: string | undefined;
  readonly sslCaPath: string | undefined;
  readonly poolMax: number;
}

export interface PaymentGatewaySettings {
  readonly baseUrl: string;
  readonly publicKey: string;
  readonly privateKey: string;
  readonly integritySecret: string;
  readonly eventsSecret: string;
  readonly postTimeoutMs: number;
  readonly getTimeoutMs: number;
  readonly getMaxRetries: number;
  readonly deadlineMs: number;
  readonly acceptanceCacheTtlSeconds: number;
}

export interface PricingSettings {
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
  readonly currency: Env['CURRENCY'];
}

export interface ReconciliationSettings {
  readonly minAgeSeconds: number;
  readonly batchSize: number;
  readonly pendingExpirationMinutes: number;
}

const appSettings = (env: Env): AppSettings => ({
  nodeEnv: env.NODE_ENV,
  appEnv: env.APP_ENV,
  isAws: env.APP_ENV === 'aws',
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
});

const httpSettings = (env: Env): HttpSettings => ({
  corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
  originVerifySecret: env.ORIGIN_VERIFY_SECRET,
});

const databaseSettings = (env: Env): DatabaseSettings => ({
  url: env.DATABASE_URL,
  host: env.DB_HOST,
  port: env.DB_PORT,
  name: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  sslCaPath: env.DB_SSL_CA_PATH,
  poolMax: env.DB_POOL_MAX,
});

const paymentGatewaySettings = (env: Env): PaymentGatewaySettings => ({
  baseUrl: env.PG_BASE_URL.replace(/\/+$/, ''),
  publicKey: env.PG_PUBLIC_KEY,
  privateKey: env.PG_PRIVATE_KEY,
  integritySecret: env.PG_INTEGRITY_SECRET,
  eventsSecret: env.PG_EVENTS_SECRET,
  postTimeoutMs: env.PG_POST_TIMEOUT_MS,
  getTimeoutMs: env.PG_GET_TIMEOUT_MS,
  getMaxRetries: env.PG_GET_MAX_RETRIES,
  deadlineMs: env.PG_DEADLINE_MS,
  acceptanceCacheTtlSeconds: env.ACCEPTANCE_CACHE_TTL_SECONDS,
});

const pricingSettings = (env: Env): PricingSettings => ({
  baseFeeInCents: env.BASE_FEE_IN_CENTS,
  deliveryFeeInCents: env.DELIVERY_FEE_IN_CENTS,
  currency: env.CURRENCY,
});

const reconciliationSettings = (env: Env): ReconciliationSettings => ({
  minAgeSeconds: env.RECONCILE_MIN_AGE_SECONDS,
  batchSize: env.RECONCILE_BATCH_SIZE,
  pendingExpirationMinutes: env.PENDING_EXPIRATION_MINUTES,
});

/** Typed, read-only view over the validated environment. The only way the app reads configuration. */
export class AppConfigService {
  readonly app: AppSettings;
  readonly http: HttpSettings;
  readonly database: DatabaseSettings;
  readonly paymentGateway: PaymentGatewaySettings;
  readonly pricing: PricingSettings;
  readonly reconciliation: ReconciliationSettings;

  constructor(env: Env) {
    this.app = appSettings(env);
    this.http = httpSettings(env);
    this.database = databaseSettings(env);
    this.paymentGateway = paymentGatewaySettings(env);
    this.pricing = pricingSettings(env);
    this.reconciliation = reconciliationSettings(env);
  }
}
