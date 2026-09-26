import { type DataSource } from 'typeorm';
import { managerFor } from '../../../../shared/infrastructure/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../../shared/kernel/unit-of-work';
import { type Product } from '../../domain/product';
import { type ProductRepository } from '../../domain/product.repository.port';
import { toProduct } from './product.mapper';
import { ProductOrmEntity } from './product.orm-entity';

export class TypeOrmProductRepository implements ProductRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findAll(limit: number): Promise<Product[]> {
    const rows = await this.repository().find({ order: { sku: 'ASC' }, take: limit });
    return rows.map(toProduct);
  }

  async findById(id: string, tx?: TransactionContext): Promise<Product | null> {
    const row = await this.repository(tx).findOneBy({ id });
    return row ? toProduct(row) : null;
  }

  private repository(tx?: TransactionContext) {
    return managerFor(this.dataSource, tx).getRepository(ProductOrmEntity);
  }
}
