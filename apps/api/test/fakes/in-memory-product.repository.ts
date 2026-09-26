import { type Product } from '../../src/modules/products/domain/product';
import { type ProductRepository } from '../../src/modules/products/domain/product.repository.port';

export class InMemoryProductRepository implements ProductRepository {
  private readonly products = new Map<string, Product>();

  constructor(products: readonly Product[] = []) {
    products.forEach((product) => this.products.set(product.id, product));
  }

  findAll(limit: number): Promise<Product[]> {
    const soldOutLast = (product: Product) => (product.stock === 0 ? 1 : 0);
    const sorted = [...this.products.values()].sort(
      (a, b) => soldOutLast(a) - soldOutLast(b) || a.sku.localeCompare(b.sku),
    );
    return Promise.resolve(sorted.slice(0, limit));
  }

  findById(id: string): Promise<Product | null> {
    return Promise.resolve(this.products.get(id) ?? null);
  }

  decrementStockIfAvailable(productId: string, quantity: number): Promise<boolean> {
    const product = this.products.get(productId);
    if (!product?.hasStock(quantity)) return Promise.resolve(false);
    this.products.set(productId, product.withStock(product.stock - quantity));
    return Promise.resolve(true);
  }

  save(product: Product): void {
    this.products.set(product.id, product);
  }
}
