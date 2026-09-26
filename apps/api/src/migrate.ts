import 'reflect-metadata';
import { awsSecretSources } from './bootstrap/aws-secret-sources';
import { loadSecretsIntoEnv, type SecretSources } from './bootstrap/secrets-loader';
import { createDataSource } from './database/data-source-options';
import { migrateAndSeed, type MigrationReport } from './database/database-tasks';
import { AppConfigService } from './shared/infrastructure/config/app-config.service';
import { parseEnv } from './shared/infrastructure/config/env.schema';

/** Runs pending migrations and the idempotent seed against the configured database. */
export async function runMigrationTask(
  env: Record<string, string | undefined>,
  sources: SecretSources,
): Promise<MigrationReport> {
  await loadSecretsIntoEnv(env, sources);
  const config = new AppConfigService(parseEnv(env));
  const dataSource = await createDataSource(config.database).initialize();
  try {
    return await migrateAndSeed(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

/** Invoked by the deploy pipeline after `cdk deploy` (the database is private). */
export const handler = (): Promise<MigrationReport> =>
  runMigrationTask(process.env, awsSecretSources());
