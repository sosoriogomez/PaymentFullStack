import { randomUUID } from 'node:crypto';
import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { migrateAndSeed } from '../../../src/database/database-tasks';
import { PRODUCT_SEEDS } from '../../../src/database/seeds/products.seed';
import { databaseSettings } from '../../support/database/settings';
import { databaseUrl, withAdminClient } from '../../support/database/template';

describe('migrateAndSeed on an empty database', () => {
  const server = process.env.TEST_DATABASE_URL ?? '';
  const name = `empty_${randomUUID().replaceAll('-', '')}`;
  let dataSource: DataSource;

  beforeAll(async () => {
    await withAdminClient(server, (client) => client.query(`CREATE DATABASE ${name}`));
    dataSource = await createDataSource(databaseSettings(databaseUrl(server, name))).initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
    await withAdminClient(server, (client) =>
      client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
    );
  });

  it('should create the schema and seed the catalog on the first run', async () => {
    const report = await migrateAndSeed(dataSource);

    expect(report.executedMigrations).toEqual([
      'InitialSchema1790380800000',
      'RestockCatalog1790532600000',
    ]);
    expect(report.seededProducts).toBe(PRODUCT_SEEDS.length);
  });

  it('should be idempotent: a second run neither migrates nor duplicates products', async () => {
    const report = await migrateAndSeed(dataSource);
    const rows = await dataSource.query<{ count: string }[]>('SELECT count(*) FROM products');

    expect(report.executedMigrations).toEqual([]);
    expect(Number(rows[0]?.count)).toBe(PRODUCT_SEEDS.length);
  });

  it('should keep live stock when the seed runs again', async () => {
    await dataSource.query(`UPDATE products SET stock = 1 WHERE sku = 'AUD-001'`);

    await migrateAndSeed(dataSource);
    const rows = await dataSource.query<{ stock: number }[]>(
      `SELECT stock FROM products WHERE sku = 'AUD-001'`,
    );

    expect(rows[0]?.stock).toBe(1);
  });

  it('should include a sold out product to show that state', async () => {
    const soldOut = await dataSource.query<unknown[]>('SELECT 1 FROM products WHERE stock = 0');

    expect(soldOut.length).toBeGreaterThanOrEqual(1);
  });
});
