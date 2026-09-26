import { randomUUID } from 'node:crypto';
import { databaseUrl, TEMPLATE_DATABASE, withAdminClient } from './template';

export interface TestDatabase {
  readonly url: string;
  drop(): Promise<void>;
}

const serverUrl = (): string => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      'TEST_DATABASE_URL is not set: run this test through the integration or e2e project',
    );
  return url;
};

/** A fresh, migrated database per test file: parallel workers never share data. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const server = serverUrl();
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  await withAdminClient(server, (client) =>
    client.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DATABASE}`),
  );
  return {
    url: databaseUrl(server, name),
    drop: async () => {
      await withAdminClient(server, (client) =>
        client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
      );
    },
  };
}
