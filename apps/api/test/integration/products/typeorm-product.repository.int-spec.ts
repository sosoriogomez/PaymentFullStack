import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { PRODUCT_SEEDS, seedProducts } from '../../../src/database/seeds/products.seed';
import { TypeOrmProductRepository } from '../../../src/modules/products/infrastructure/persistence/typeorm-product.repository';
import { TypeOrmUnitOfWork } from '../../../src/shared/infrastructure/database/typeorm-unit-of-work';
import { ok } from '../../../src/shared/kernel/result';
import { databaseSettings } from '../../support/database/settings';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';

describe('TypeOrmProductRepository', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  let repository: TypeOrmProductRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
    repository = new TypeOrmProductRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('should list available products first, then sold out ones, by sku, with a limit', async () => {
    const all = await repository.findAll(50);
    const firstTwo = await repository.findAll(2);
    const bySku = (a: { sku: string }, b: { sku: string }) => a.sku.localeCompare(b.sku);
    const expected = [
      ...PRODUCT_SEEDS.filter((seed) => seed.stock > 0).sort(bySku),
      ...PRODUCT_SEEDS.filter((seed) => seed.stock === 0).sort(bySku),
    ].map((seed) => seed.sku);

    expect(all.map((product) => product.sku)).toEqual(expected);
    expect(all.at(-1)?.stock).toBe(0);
    expect(firstTwo).toHaveLength(2);
  });

  it('should map prices as integer cents in COP and keep the image key', async () => {
    const seed = PRODUCT_SEEDS[0]!;

    const product = await repository.findById(seed.id);

    expect(product?.price.amountInCents).toBe(seed.priceInCents);
    expect(typeof product?.price.amountInCents).toBe('number');
    expect(product?.price.currency).toBe('COP');
    expect(product?.imageKey).toBe(seed.imageKey);
    expect(product?.updatedAt).toBeInstanceOf(Date);
  });

  it('should return null for unknown ids', async () => {
    expect(await repository.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('should read inside a unit of work', async () => {
    const seed = PRODUCT_SEEDS[1]!;

    const result = await new TypeOrmUnitOfWork(dataSource).run(async (tx) =>
      ok(await repository.findById(seed.id, tx)),
    );

    expect(result.ok && result.value?.sku).toBe(seed.sku);
  });
});
