import { type MigrationInterface, type QueryRunner } from 'typeorm';

const RESTOCK_UNITS = 5;

/**
 * Data migration: five more units of every product, at the author's request. The database is
 * private, so a migration is the versioned way to change its data. On a new database it runs
 * before the seed and changes nothing; the seed keeps the initial catalog.
 */
export class RestockCatalog1790532600000 implements MigrationInterface {
  name = 'RestockCatalog1790532600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE products SET stock = stock + $1`, [RESTOCK_UNITS]);
  }

  /** Units sold since the restock cannot be given back: the stock never goes below zero. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE products SET stock = GREATEST(stock - $1, 0)`, [RESTOCK_UNITS]);
  }
}
