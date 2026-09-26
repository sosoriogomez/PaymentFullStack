import { Column, Entity, PrimaryColumn } from 'typeorm';
import { DELIVERY_STATUSES, type DeliveryStatus } from '../../domain/delivery';

@Entity({ name: 'deliveries' })
export class DeliveryOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'recipient_name', type: 'varchar', length: 80 })
  recipientName!: string;

  @Column({ name: 'recipient_phone', type: 'varchar', length: 20 })
  recipientPhone!: string;

  @Column({ name: 'address_line_1', type: 'varchar', length: 120 })
  addressLine1!: string;

  @Column({ name: 'address_line_2', type: 'varchar', length: 120, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 80 })
  city!: string;

  @Column({ type: 'varchar', length: 80 })
  region!: string;

  @Column({ type: 'char', length: 2 })
  country!: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 10, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'enum', enum: DELIVERY_STATUSES, enumName: 'delivery_status' })
  status!: DeliveryStatus;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
