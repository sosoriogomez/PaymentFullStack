import { Product } from '../../src/modules/products/domain/product';
import { Money } from '../../src/shared/kernel/money';

export const PRODUCT_ID = '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e01';

export const cop = (cents: number): Money => {
  const money = Money.of(cents, 'COP');
  if (!money.ok) throw new Error(`invalid test amount ${cents}`);
  return money.value;
};

/** Test data builder: `aProduct().withStock(3).build()`. */
export class ProductBuilder {
  private props = {
    id: PRODUCT_ID,
    sku: 'AUD-001',
    name: 'Audífonos inalámbricos Pulse',
    description: 'Cancelación activa de ruido.',
    price: cop(150_000_00),
    stock: 5,
    imageKey: 'wireless-headphones',
    updatedAt: new Date('2026-10-01T15:00:00.000Z'),
  };

  withId(id: string): this {
    this.props = { ...this.props, id };
    return this;
  }

  withSku(sku: string): this {
    this.props = { ...this.props, sku };
    return this;
  }

  withStock(stock: number): this {
    this.props = { ...this.props, stock };
    return this;
  }

  withPrice(cents: number): this {
    this.props = { ...this.props, price: cop(cents) };
    return this;
  }

  build(): Product {
    return Product.restore(this.props);
  }
}

export const aProduct = (): ProductBuilder => new ProductBuilder();
