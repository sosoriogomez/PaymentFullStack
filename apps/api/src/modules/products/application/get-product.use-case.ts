import { ok, type Result } from '../../../shared/kernel/result';
import { type Product } from '../domain/product';
import { type ProductNotFound, productNotFound } from '../domain/product-errors';
import { type ProductRepository } from '../domain/product.repository.port';

export class GetProduct {
  constructor(private readonly products: ProductRepository) {}

  async execute(productId: string): Promise<Result<Product, ProductNotFound>> {
    const product = await this.products.findById(productId);
    return product ? ok(product) : productNotFound(productId);
  }
}
