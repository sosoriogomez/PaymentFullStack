import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../../shared/infrastructure/database/bigint.transformer';

@Entity({ name: 'products' })
export class ProductOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  sku!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'price_in_cents', type: 'bigint', transformer: bigintTransformer })
  priceInCents!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'integer' })
  stock!: number;

  @Column({ name: 'image_key', type: 'varchar', length: 80 })
  imageKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
