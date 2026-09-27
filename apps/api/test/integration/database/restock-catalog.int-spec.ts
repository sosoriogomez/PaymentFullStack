import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { RestockCatalog1790532600000 } from '../../../src/database/migrations/1790532600000-restock-catalog';
import { PRODUCT_SEEDS, seedProducts } from '../../../src/database/seeds/products.seed';
import { databaseSettings } from '../../support/database/settings';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';

describe('RestockCatalog migration', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  const migration = new RestockCatalog1790532600000();

  const stockBySku = async (): Promise<Record<string, number>> => {
    const rows = await dataSource.query<{ sku: string; stock: number }[]>(
      'SELECT sku, stock FROM products',
    );
    return Object.fromEntries(rows.map((row) => [row.sku, row.stock]));
  };

  const seededStockPlus = (units: number): Record<string, number> =>
    Object.fromEntries(PRODUCT_SEEDS.map((seed) => [seed.sku, seed.stock + units]));

  const run = async (step: 'up' | 'down'): Promise<void> => {
    const queryRunner = dataSource.createQueryRunner();
    try {
      await migration[step](queryRunner);
    } finally {
      await queryRunner.release();
    }
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('should add five units to every product, the sold out one included', async () => {
    await run('up');

    expect(await stockBySku()).toEqual(seededStockPlus(5));
  });

  it('should take the five units back on the way down, never below zero', async () => {
    // Units sold after the restock cannot be given back.
    await dataSource.query(`UPDATE products SET stock = 2 WHERE sku = 'AUD-001'`);

    await run('down');

    expect(await stockBySku()).toEqual({ ...seededStockPlus(0), 'AUD-001': 0 });
  });
});
