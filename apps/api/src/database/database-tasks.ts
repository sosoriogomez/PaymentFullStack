import { type DataSource } from 'typeorm';
import { seedProducts } from './seeds/products.seed';

export interface MigrationReport {
  readonly executedMigrations: readonly string[];
  readonly seededProducts: number;
}

/** Runs pending migrations (each in its own transaction) and the idempotent catalog seed. */
export async function migrateAndSeed(dataSource: DataSource): Promise<MigrationReport> {
  const executed = await dataSource.runMigrations({ transaction: 'each' });
  const seededProducts = await seedProducts(dataSource);
  return { executedMigrations: executed.map((migration) => migration.name), seededProducts };
}
