import { Client } from 'pg';
import { createDataSource } from '../../../src/database/data-source-options';
import { databaseSettings } from './settings';

export const TEMPLATE_DATABASE = 'checkout_template';

export const databaseUrl = (serverUrl: string, database: string): string => {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

export async function withAdminClient<T>(
  serverUrl: string,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl(serverUrl, 'postgres') });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Creates the migrated template every test database is cloned from (cheap and isolated). */
export async function prepareTemplateDatabase(serverUrl: string): Promise<void> {
  await withAdminClient(serverUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DATABASE} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`);
  });
  const dataSource = await createDataSource(
    databaseSettings(databaseUrl(serverUrl, TEMPLATE_DATABASE)),
  ).initialize();
  try {
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
