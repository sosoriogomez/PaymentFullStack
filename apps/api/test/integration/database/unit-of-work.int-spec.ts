import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { seedProducts } from '../../../src/database/seeds/products.seed';
import {
  managerFor,
  TypeOrmUnitOfWork,
} from '../../../src/shared/infrastructure/database/typeorm-unit-of-work';
import { err, ok } from '../../../src/shared/kernel/result';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';
import { databaseSettings } from '../../support/database/settings';

const SKU = 'AUD-001';

describe('TypeOrmUnitOfWork', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  let unitOfWork: TypeOrmUnitOfWork;

  const stockOf = async (): Promise<number> => {
    const rows: { stock: number }[] = await dataSource.query(
      'SELECT stock FROM products WHERE sku = $1',
      [SKU],
    );
    return rows[0]?.stock ?? Number.NaN;
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
    unitOfWork = new TypeOrmUnitOfWork(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  const decrement = (tx: Parameters<typeof managerFor>[1]) =>
    managerFor(dataSource, tx).query('UPDATE products SET stock = stock - 1 WHERE sku = $1', [SKU]);

  it('should commit the work when it returns ok', async () => {
    const before = await stockOf();

    const result = await unitOfWork.run(async (tx) => {
      await decrement(tx);
      return ok('done');
    });

    expect(result).toEqual(ok('done'));
    expect(await stockOf()).toBe(before - 1);
  });

  it('should roll back the work when it returns an error', async () => {
    const before = await stockOf();

    const result = await unitOfWork.run(async (tx) => {
      await decrement(tx);
      return err('insufficient funds');
    });

    expect(result).toEqual(err('insufficient funds'));
    expect(await stockOf()).toBe(before);
  });

  it('should roll back and rethrow when the work throws', async () => {
    const before = await stockOf();

    await expect(
      unitOfWork.run(async (tx) => {
        await decrement(tx);
        throw new Error('bug');
      }),
    ).rejects.toThrow('bug');
    expect(await stockOf()).toBe(before);
  });

  it('should use the default manager outside a unit of work', () => {
    expect(managerFor(dataSource)).toBe(dataSource.manager);
  });
});
