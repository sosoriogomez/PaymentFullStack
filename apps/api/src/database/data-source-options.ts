import { readFileSync } from 'node:fs';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { type DatabaseSettings } from '../shared/infrastructure/config/app-config.service';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';

const connectionOf = (settings: DatabaseSettings) =>
  settings.url
    ? { url: settings.url }
    : {
        host: settings.host ?? '',
        port: settings.port,
        database: settings.name ?? '',
        username: settings.user ?? '',
        password: settings.password ?? '',
      };

/** TLS is verified against the RDS CA bundle when a path is configured (rds.force_ssl = 1). */
const sslOf = (caPath: string | undefined) =>
  caPath ? { rejectUnauthorized: true, ca: readFileSync(caPath, 'utf8') } : false;

/** One definition shared by the app, the migrate handler, the CLI and the tests. */
export function buildDataSourceOptions(settings: DatabaseSettings): DataSourceOptions {
  return {
    type: 'postgres',
    ...connectionOf(settings),
    entities: [...ENTITIES],
    migrations: [...MIGRATIONS],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    migrationsRun: false,
    logging: false,
    ssl: sslOf(settings.sslCaPath),
    // Small pool: one Lambda instance serves one request at a time and RDS micro has few connections.
    extra: { max: settings.poolMax, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000 },
  };
}

export const createDataSource = (settings: DatabaseSettings): DataSource =>
  new DataSource(buildDataSourceOptions(settings));
