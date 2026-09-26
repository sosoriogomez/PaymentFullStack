import { type DataSource } from 'typeorm';
import { managerFor } from '../../../../shared/infrastructure/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../../shared/kernel/unit-of-work';
import { type Product } from '../../domain/product';
import { type ProductRepository } from '../../domain/product.repository.port';
import { toProduct } from './product.mapper';
import { ProductOrmEntity } from './product.orm-entity';

export class TypeOrmProductRepository implements ProductRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** Available products first, sold out ones last; then by SKU for a stable order. */
  async findAll(limit: number): Promise<Product[]> {
    const rows = await this.repository()
      .createQueryBuilder('product')
      .orderBy('product.stock = 0', 'ASC')
      .addOrderBy('product.sku', 'ASC')
      .take(limit)
      .getMany();
    return rows.map(toProduct);
  }

  async findById(id: string, tx?: TransactionContext): Promise<Product | null> {
    const row = await this.repository(tx).findOneBy({ id });
    return row ? toProduct(row) : null;
  }

  async decrementStockIfAvailable(
    productId: string,
    quantity: number,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const result = await this.repository(tx)
      .createQueryBuilder()
      .update()
      .set({ stock: () => 'stock - :quantity' })
      .where('id = :productId AND stock >= :quantity', { productId, quantity })
      .execute();
    return result.affected === 1;
  }

  private repository(tx?: TransactionContext) {
    return managerFor(this.dataSource, tx).getRepository(ProductOrmEntity);
  }
}
