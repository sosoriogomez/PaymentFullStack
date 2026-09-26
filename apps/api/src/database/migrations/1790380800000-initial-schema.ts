import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class InitialSchema1790380800000 implements MigrationInterface {
  name = 'InitialSchema1790380800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(
      `CREATE TYPE transaction_status AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')`,
    );
    await queryRunner.query(`CREATE TYPE delivery_status AS ENUM ('ASSIGNED', 'BACKORDERED')`);
    await this.createProducts(queryRunner);
    await this.createCustomers(queryRunner);
    await this.createTransactions(queryRunner);
    await this.createDeliveries(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE deliveries`);
    await queryRunner.query(`DROP TABLE transactions`);
    await queryRunner.query(`DROP TABLE customers`);
    await queryRunner.query(`DROP TABLE products`);
    await queryRunner.query(`DROP TYPE delivery_status`);
    await queryRunner.query(`DROP TYPE transaction_status`);
  }

  private async createProducts(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE products (
        id              uuid PRIMARY KEY,
        sku             varchar(40)  NOT NULL UNIQUE,
        name            varchar(120) NOT NULL,
        description     text         NOT NULL,
        price_in_cents  bigint       NOT NULL CHECK (price_in_cents > 0),
        currency        char(3)      NOT NULL DEFAULT 'COP',
        stock           integer      NOT NULL CHECK (stock >= 0),
        image_key       varchar(80)  NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        updated_at      timestamptz  NOT NULL DEFAULT now()
      )`);
  }

  private async createCustomers(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customers (
        id          uuid PRIMARY KEY,
        email       citext      NOT NULL UNIQUE,
        full_name   varchar(80) NOT NULL,
        phone       varchar(20) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )`);
  }

  private async createTransactions(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transactions (
        id                       uuid PRIMARY KEY,
        reference                varchar(40)  NOT NULL UNIQUE,
        product_id               uuid         NOT NULL REFERENCES products (id),
        customer_id              uuid         NOT NULL REFERENCES customers (id),
        quantity                 integer      NOT NULL CHECK (quantity > 0),
        product_amount_in_cents  bigint       NOT NULL CHECK (product_amount_in_cents >= 0),
        base_fee_in_cents        bigint       NOT NULL CHECK (base_fee_in_cents >= 0),
        delivery_fee_in_cents    bigint       NOT NULL CHECK (delivery_fee_in_cents >= 0),
        total_amount_in_cents    bigint       NOT NULL,
        currency                 char(3)      NOT NULL,
        status                   transaction_status NOT NULL DEFAULT 'PENDING',
        status_message           varchar(255),
        gateway_transaction_id   varchar(64)  UNIQUE,
        card_brand               varchar(20),
        card_last_four           char(4),
        installments             smallint     NOT NULL CHECK (installments BETWEEN 1 AND 36),
        idempotency_key          uuid         NOT NULL UNIQUE,
        request_hash             char(64)     NOT NULL,
        shipping_snapshot        jsonb        NOT NULL,
        finalized_at             timestamptz,
        created_at               timestamptz  NOT NULL DEFAULT now(),
        updated_at               timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT transactions_total_is_sum CHECK (
          total_amount_in_cents = product_amount_in_cents + base_fee_in_cents + delivery_fee_in_cents
        ),
        CONSTRAINT transactions_finalized_iff_final CHECK ((status = 'PENDING') = (finalized_at IS NULL))
      )`);
    await queryRunner.query(
      `CREATE INDEX transactions_status_created_at_idx ON transactions (status, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX transactions_customer_id_idx ON transactions (customer_id)`,
    );
  }

  private async createDeliveries(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE deliveries (
        id               uuid PRIMARY KEY,
        transaction_id   uuid         NOT NULL UNIQUE REFERENCES transactions (id),
        customer_id      uuid         NOT NULL REFERENCES customers (id),
        product_id       uuid         NOT NULL REFERENCES products (id),
        quantity         integer      NOT NULL CHECK (quantity > 0),
        recipient_name   varchar(80)  NOT NULL,
        recipient_phone  varchar(20)  NOT NULL,
        address_line_1   varchar(120) NOT NULL,
        address_line_2   varchar(120),
        city             varchar(80)  NOT NULL,
        region           varchar(80)  NOT NULL,
        country          char(2)      NOT NULL,
        postal_code      varchar(10),
        status           delivery_status NOT NULL,
        created_at       timestamptz  NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`CREATE INDEX deliveries_customer_id_idx ON deliveries (customer_id)`);
  }
}
