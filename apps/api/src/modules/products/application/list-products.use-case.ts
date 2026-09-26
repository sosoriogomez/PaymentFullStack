import { ok, type Result } from '../../../shared/kernel/result';
import { type Product } from '../domain/product';
import { type ProductRepository } from '../domain/product.repository.port';

export interface ListProductsQuery {
  readonly limit: number;
}

export class ListProducts {
  constructor(private readonly products: ProductRepository) {}

  async execute(query: ListProductsQuery): Promise<Result<Product[], never>> {
    return ok(await this.products.findAll(query.limit));
  }
}
