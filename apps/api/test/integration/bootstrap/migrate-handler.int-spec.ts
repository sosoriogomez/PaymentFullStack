import { randomUUID } from 'node:crypto';
import { runMigrationTask } from '../../../src/migrate';
import { type SecretSources } from '../../../src/bootstrap/secrets-loader';
import { databaseUrl, withAdminClient } from '../../support/database/template';
import { testEnv } from '../../support/test-env';

const noSecrets: SecretSources = {
  getParameters: () => Promise.resolve({}),
  getSecretString: () => Promise.reject(new Error('not used')),
};

describe('runMigrationTask (migrate Lambda)', () => {
  const server = process.env.TEST_DATABASE_URL ?? '';
  const name = `migrate_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    await withAdminClient(server, (client) => client.query(`CREATE DATABASE ${name}`));
  });

  afterAll(async () => {
    await withAdminClient(server, (client) =>
      client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
    );
  });

  it('should migrate and seed a new database, then be a no-op', async () => {
    const env = testEnv({ DATABASE_URL: databaseUrl(server, name) });

    const first = await runMigrationTask({ ...env }, noSecrets);
    const second = await runMigrationTask({ ...env }, noSecrets);

    expect(first.executedMigrations).toHaveLength(1);
    expect(first.seededProducts).toBe(5);
    expect(second.executedMigrations).toEqual([]);
  });

  it('should fail when the configuration is invalid', async () => {
    await expect(runMigrationTask(testEnv({ DATABASE_URL: undefined }), noSecrets)).rejects.toThrow(
      /DATABASE_URL/,
    );
  });
});
