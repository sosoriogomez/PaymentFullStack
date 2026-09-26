import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { TypeOrmCustomerRepository } from '../../../src/modules/customers/infrastructure/persistence/typeorm-customer.repository';
import { aCustomer } from '../../builders/customer.builder';
import { databaseSettings } from '../../support/database/settings';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';

describe('TypeOrmCustomerRepository', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  let repository: TypeOrmCustomerRepository;

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    repository = new TypeOrmCustomerRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  it('should insert a new customer and report it as created', async () => {
    const result = await repository.upsertByEmail(aCustomer());

    expect(result.created).toBe(true);
    expect(await repository.findById(aCustomer().id)).toMatchObject({
      email: 'ana@mail.com',
      fullName: 'Ana Pérez',
    });
  });

  it('should update the same email (case-insensitive) keeping the original id', async () => {
    const again = aCustomer({
      id: '33333333-3333-4333-8333-333333333333',
      email: 'ANA@MAIL.com',
      phone: '3109876543',
    });

    const result = await repository.upsertByEmail(again);
    const rows = await dataSource.query<{ count: string }[]>('SELECT count(*) FROM customers');

    expect(result.created).toBe(false);
    expect(result.customer.id).toBe(aCustomer().id);
    expect(result.customer.phone).toBe('3109876543');
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('should return null for unknown ids', async () => {
    expect(await repository.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
