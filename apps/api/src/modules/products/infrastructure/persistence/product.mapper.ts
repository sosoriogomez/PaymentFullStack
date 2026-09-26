import { trusted } from '../../../../shared/infrastructure/database/trusted';
import { Money } from '../../../../shared/kernel/money';
import { Product } from '../../domain/product';
import { type ProductOrmEntity } from './product.orm-entity';

export const toProduct = (row: ProductOrmEntity): Product =>
  Product.restore({
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    price: trusted(Money.of(row.priceInCents, row.currency), `price of product ${row.id}`),
    stock: row.stock,
    imageKey: row.imageKey,
    updatedAt: row.updatedAt,
  });
