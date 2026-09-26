import { type Product } from '../../src/modules/products/domain/product';
import { type ProductRepository } from '../../src/modules/products/domain/product.repository.port';

export class InMemoryProductRepository implements ProductRepository {
  private readonly products = new Map<string, Product>();

  constructor(products: readonly Product[] = []) {
    products.forEach((product) => this.products.set(product.id, product));
  }

  findAll(limit: number): Promise<Product[]> {
    const sorted = [...this.products.values()].sort((a, b) => a.sku.localeCompare(b.sku));
    return Promise.resolve(sorted.slice(0, limit));
  }

  findById(id: string): Promise<Product | null> {
    return Promise.resolve(this.products.get(id) ?? null);
  }

  save(product: Product): void {
    this.products.set(product.id, product);
  }
}
