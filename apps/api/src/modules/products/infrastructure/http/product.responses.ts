import { type ProductStock } from '../../application/get-product-stock.use-case';
import { type Product } from '../../domain/product';

export class ProductResponse {
  readonly id!: string;
  readonly name!: string;
  readonly description!: string;
  readonly priceInCents!: number;
  readonly currency!: string;
  readonly stock!: number;
  readonly imageKey!: string;

  static from(product: Product): ProductResponse {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      priceInCents: product.price.amountInCents,
      currency: product.price.currency,
      stock: product.stock,
      imageKey: product.imageKey,
    };
  }
}

export class ProductListResponse {
  readonly items!: ProductResponse[];
}

export class ProductStockResponse {
  readonly productId!: string;
  readonly available!: number;
  readonly updatedAt!: string;

  static from(stock: ProductStock): ProductStockResponse {
    return {
      productId: stock.productId,
      available: stock.available,
      updatedAt: stock.updatedAt.toISOString(),
    };
  }
}
