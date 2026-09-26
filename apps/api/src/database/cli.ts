import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { AppConfigService } from '../shared/infrastructure/config/app-config.service';
import { parseEnv } from '../shared/infrastructure/config/env.schema';
import { createDataSource } from './data-source-options';
import { migrateAndSeed } from './database-tasks';

const write = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

/** Local database tasks: `node dist/database/cli.js <migrate|reset>`. */
async function main(command: string | undefined): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = new AppConfigService(parseEnv(process.env));
  if (command !== 'migrate' && command !== 'reset')
    throw new Error('Usage: cli.js <migrate|reset>');
  if (command === 'reset' && config.app.isAws)
    throw new Error('reset is only allowed in local environments');

  const dataSource = await createDataSource(config.database).initialize();
  try {
    if (command === 'reset') await dataSource.dropDatabase();
    const report = await migrateAndSeed(dataSource);
    write(`Migrations executed: ${report.executedMigrations.join(', ') || 'none'}`);
    write(`Products seeded: ${report.seededProducts}`);
  } finally {
    await dataSource.destroy();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
