import { type DataSource } from 'typeorm';
import { createDataSource } from '../../../src/database/data-source-options';
import { PRODUCT_SEEDS, seedProducts } from '../../../src/database/seeds/products.seed';
import { databaseSettings } from '../../support/database/settings';
import { createTestDatabase, type TestDatabase } from '../../support/database/test-database';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

describe('database invariants', () => {
  let database: TestDatabase;
  let dataSource: DataSource;
  const product = PRODUCT_SEEDS[0]!;

  beforeAll(async () => {
    database = await createTestDatabase();
    dataSource = await createDataSource(databaseSettings(database.url)).initialize();
    await seedProducts(dataSource);
    await dataSource.query(
      `INSERT INTO customers (id, email, full_name, phone) VALUES ($1, 'Ana@Mail.com', 'Ana Pérez', '3001234567')`,
      [CUSTOMER_ID],
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await database.drop();
  });

  const insertTransaction = (overrides: Record<string, unknown> = {}) => {
    const row = {
      total: 16_300_000,
      status: 'PENDING',
      finalizedAt: null,
      ...overrides,
    };
    return dataSource.query(
      `INSERT INTO transactions (id, reference, product_id, customer_id, quantity, product_amount_in_cents,
         base_fee_in_cents, delivery_fee_in_cents, total_amount_in_cents, currency, status, installments,
         idempotency_key, request_hash, shipping_snapshot, finalized_at)
       VALUES (gen_random_uuid(), 'TX-' || gen_random_uuid(), $1, $2, 1, 15000000, 300000, 1000000, $3, 'COP', $4, 1,
         gen_random_uuid(), repeat('a', 64), '{}'::jsonb, $5)`,
      [product.id, CUSTOMER_ID, row.total, row.status, row.finalizedAt],
    );
  };

  it('should accept a consistent pending transaction', async () => {
    await expect(insertTransaction()).resolves.toBeDefined();
  });

  it('should reject a total that is not the sum of its parts', async () => {
    await expect(insertTransaction({ total: 16_300_001 })).rejects.toThrow(
      /transactions_total_is_sum/,
    );
  });

  it('should reject a final status without finalized_at and vice versa', async () => {
    await expect(insertTransaction({ status: 'APPROVED' })).rejects.toThrow(
      /transactions_finalized_iff_final/,
    );
    await expect(insertTransaction({ finalizedAt: new Date() })).rejects.toThrow(
      /transactions_finalized_iff_final/,
    );
  });

  it('should never let stock go negative', async () => {
    await expect(
      dataSource.query(`UPDATE products SET stock = -1 WHERE id = $1`, [product.id]),
    ).rejects.toThrow(/products_stock_check/);
  });

  it('should treat customer emails case-insensitively', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO customers (id, email, full_name, phone) VALUES (gen_random_uuid(), 'ana@mail.COM', 'Otra', '3000000000')`,
      ),
    ).rejects.toThrow(/customers_email_key/);
  });
});
