import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { type DatabaseSettings } from '../shared/infrastructure/config/app-config.service';
import { buildDataSourceOptions, createDataSource } from './data-source-options';
import { MIGRATIONS } from './migrations';

const settings = (overrides: Partial<DatabaseSettings> = {}): DatabaseSettings => ({
  url: undefined,
  host: 'db.internal',
  port: 5432,
  name: 'checkout',
  user: 'app',
  password: 'secret',
  sslCaPath: undefined,
  poolMax: 2,
  ...overrides,
});

const optionsFor = (overrides: Partial<DatabaseSettings> = {}) =>
  buildDataSourceOptions(settings(overrides)) as PostgresConnectionOptions;

describe('buildDataSourceOptions', () => {
  it('should prefer the connection url when present', () => {
    const options = optionsFor({ url: 'postgres://u:p@localhost:5432/checkout' });

    expect(options.url).toBe('postgres://u:p@localhost:5432/checkout');
    expect(options.host).toBeUndefined();
  });

  it('should use discrete settings otherwise', () => {
    expect(optionsFor()).toMatchObject({
      host: 'db.internal',
      port: 5432,
      database: 'checkout',
      username: 'app',
      password: 'secret',
    });
  });

  it('should never synchronize the schema and should register migrations explicitly', () => {
    const options = optionsFor();

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.migrations).toEqual(MIGRATIONS);
  });

  it('should keep a small connection pool', () => {
    expect(optionsFor({ poolMax: 2 }).extra).toMatchObject({ max: 2 });
  });

  it('should disable TLS locally and verify the certificate when a CA bundle is configured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ca-'));
    const caPath = join(dir, 'global-bundle.pem');
    writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n');

    expect(optionsFor().ssl).toBe(false);
    expect(optionsFor({ sslCaPath: caPath }).ssl).toEqual({
      rejectUnauthorized: true,
      ca: expect.stringContaining('BEGIN CERTIFICATE'),
    });
  });

  it('should fill missing discrete settings with empty strings instead of undefined', () => {
    const options = optionsFor({
      host: undefined,
      name: undefined,
      user: undefined,
      password: undefined,
    });

    expect(options).toMatchObject({ host: '', database: '', username: '', password: '' });
  });

  it('should create a data source that is not connected yet', () => {
    expect(createDataSource(settings()).isInitialized).toBe(false);
  });
});
