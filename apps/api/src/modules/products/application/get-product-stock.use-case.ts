import { AsyncResult } from '../../../shared/kernel/async-result';
import { type Result } from '../../../shared/kernel/result';
import { type ProductNotFound } from '../domain/product-errors';
import { type GetProduct } from './get-product.use-case';

export interface ProductStock {
  readonly productId: string;
  readonly available: number;
  readonly updatedAt: Date;
}

/** Lightweight read of the `stock` resource, used right after a purchase (I-07). */
export class GetProductStock {
  constructor(private readonly getProduct: GetProduct) {}

  async execute(productId: string): Promise<Result<ProductStock, ProductNotFound>> {
    return await AsyncResult.from(this.getProduct.execute(productId)).map((product) => ({
      productId: product.id,
      available: product.stock,
      updatedAt: product.updatedAt,
    }));
  }
}
