import 'reflect-metadata';
import { type INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { awsSecretSources } from './bootstrap/aws-secret-sources';
import { loadSecretsIntoEnv, type SecretSources } from './bootstrap/secrets-loader';
import {
  ReconcilePendingTransactions,
  type ReconciliationSummary,
} from './modules/transactions/application/reconcile-pending-transactions.use-case';
import { ReconcileModule } from './reconcile.module';

let contextPromise: Promise<INestApplicationContext> | undefined;

/** Built once per Lambda container: secrets first, then a Nest context without HTTP. */
async function createContext(sources: SecretSources): Promise<INestApplicationContext> {
  await loadSecretsIntoEnv(process.env, sources);
  const context = await NestFactory.createApplicationContext(ReconcileModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  context.useLogger(context.get(PinoLogger));
  return context;
}

/** One reconciliation run; the summary is logged as a metric and returned to the invoker. */
export async function runReconciliation(sources: SecretSources): Promise<ReconciliationSummary> {
  contextPromise ??= createContext(sources).catch((error: unknown) => {
    contextPromise = undefined;
    throw error;
  });
  const context = await contextPromise;
  const summary = await context.get(ReconcilePendingTransactions).execute();
  new Logger('Reconciliation').log(JSON.stringify({ metric: 'reconciliation', ...summary }));
  return summary;
}

/** Closes the cached context (tests and graceful shutdown). */
export async function closeReconciliationContext(): Promise<void> {
  const context = await contextPromise;
  contextPromise = undefined;
  await context?.close();
}

/** Invoked by EventBridge Scheduler every 5 minutes (C-03, ADR-007). */
export const handler = (): Promise<ReconciliationSummary> => runReconciliation(awsSecretSources());
