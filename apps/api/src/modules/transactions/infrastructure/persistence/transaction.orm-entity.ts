import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../../shared/infrastructure/database/bigint.transformer';
import { type ShippingSnapshot } from '../../domain/shipping-address';
import { TRANSACTION_STATUSES, type TransactionStatus } from '../../domain/transaction-status';

/** Name Postgres gives to `idempotency_key uuid UNIQUE` in the initial migration. */
export const IDEMPOTENCY_KEY_CONSTRAINT = 'transactions_idempotency_key_key';

@Entity({ name: 'transactions' })
export class TransactionOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  reference!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'product_amount_in_cents', type: 'bigint', transformer: bigintTransformer })
  productAmountInCents!: number;

  @Column({ name: 'base_fee_in_cents', type: 'bigint', transformer: bigintTransformer })
  baseFeeInCents!: number;

  @Column({ name: 'delivery_fee_in_cents', type: 'bigint', transformer: bigintTransformer })
  deliveryFeeInCents!: number;

  @Column({ name: 'total_amount_in_cents', type: 'bigint', transformer: bigintTransformer })
  totalAmountInCents!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'enum', enum: TRANSACTION_STATUSES, enumName: 'transaction_status' })
  status!: TransactionStatus;

  @Column({ name: 'status_message', type: 'varchar', length: 255, nullable: true })
  statusMessage!: string | null;

  @Column({ name: 'gateway_transaction_id', type: 'varchar', length: 64, nullable: true })
  gatewayTransactionId!: string | null;

  @Column({ name: 'card_brand', type: 'varchar', length: 20, nullable: true })
  cardBrand!: string | null;

  @Column({ name: 'card_last_four', type: 'char', length: 4, nullable: true })
  cardLastFour!: string | null;

  @Column({ type: 'smallint' })
  installments!: number;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ name: 'shipping_snapshot', type: 'jsonb' })
  shippingSnapshot!: ShippingSnapshot;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

  /** Set by the application clock, so the reconciliation compares ages on the same time source. */
  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
