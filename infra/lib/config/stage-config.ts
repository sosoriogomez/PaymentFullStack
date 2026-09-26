import { Duration } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

export const PROJECT = 'checkout';

export type StageName = 'prod';

export interface ApiStageConfig {
  readonly memoryMb: number;
  readonly timeout: Duration;
  /** C-02: undefined by default. New accounts have a concurrency quota of 10 and AWS keeps 10 unreserved. */
  readonly reservedConcurrency?: number;
  readonly throttle: { readonly rateLimit: number; readonly burstLimit: number };
  readonly baseFeeInCents: number;
  readonly deliveryFeeInCents: number;
}

export interface DatabaseStageConfig {
  readonly instanceType: string;
  readonly allocatedStorageGb: number;
  readonly backupRetention: Duration;
  readonly databaseName: string;
  readonly poolMax: number;
}

export interface StageConfig {
  readonly stage: StageName;
  readonly region: string;
  readonly api: ApiStageConfig;
  readonly database: DatabaseStageConfig;
  readonly reconcile: { readonly rate: Duration };
  readonly logRetention: RetentionDays;
}

export const STAGES: Readonly<Record<StageName, StageConfig>> = {
  prod: {
    stage: 'prod',
    region: 'us-east-1',
    api: {
      memoryMb: 1024,
      timeout: Duration.seconds(20),
      throttle: { rateLimit: 25, burstLimit: 50 },
      baseFeeInCents: 300_000,
      deliveryFeeInCents: 1_000_000,
    },
    database: {
      instanceType: 't4g.micro',
      allocatedStorageGb: 20,
      backupRetention: Duration.days(1),
      databaseName: 'checkout',
      poolMax: 2,
    },
    reconcile: { rate: Duration.minutes(5) },
    logRetention: RetentionDays.TWO_WEEKS,
  },
};

export function stageConfig(stage: unknown): StageConfig {
  if (typeof stage !== 'string' || !(stage in STAGES)) {
    throw new Error(
      `Unknown stage "${String(stage)}". Valid stages: ${Object.keys(STAGES).join(', ')}`,
    );
  }
  return STAGES[stage as StageName];
}

/** Resource name with the project and stage prefix, e.g. `checkout-prod-api`. */
export const resourceName = (config: StageConfig, suffix: string): string =>
  `${PROJECT}-${config.stage}-${suffix}`;

/** SSM path prefix for the stage parameters, e.g. `/checkout/prod`. */
export const parameterPrefix = (config: StageConfig): string => `/${PROJECT}/${config.stage}`;
