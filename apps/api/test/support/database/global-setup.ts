import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { prepareTemplateDatabase } from './template';

declare global {
  var postgresTestContainer: StartedPostgreSqlContainer | undefined;
}

/**
 * Starts one Postgres 16 for the whole run (or reuses TEST_DATABASE_URL, e.g. a CI service) and
 * migrates the template database. Workers inherit TEST_DATABASE_URL.
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env.TEST_DATABASE_URL) {
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withUsername('checkout')
      .withPassword('checkout')
      .withDatabase('postgres')
      .start();
    globalThis.postgresTestContainer = container;
    process.env.TEST_DATABASE_URL = container.getConnectionUri();
    process.env.TEST_DATABASE_TEMPLATE_READY = '';
  }
  if (!process.env.TEST_DATABASE_TEMPLATE_READY) {
    await prepareTemplateDatabase(process.env.TEST_DATABASE_URL);
    process.env.TEST_DATABASE_TEMPLATE_READY = 'true';
  }
}
