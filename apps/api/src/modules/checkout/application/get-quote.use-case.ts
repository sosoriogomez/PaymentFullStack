import { AsyncResult } from '../../../shared/kernel/async-result';
import { type DomainError } from '../../../shared/kernel/domain-error';
import { err, map, ok, type Result } from '../../../shared/kernel/result';
import { type Product } from '../../products/domain/product';
import { type ProductRepository } from '../../products/domain/product.repository.port';
import { type FeePolicy } from '../domain/fee-policy.port';
import { type OrderAmounts, priceOrder } from '../domain/order-amounts';
import { Quantity } from '../domain/quantity';

export interface GetQuoteQuery {
  readonly productId: string;
  readonly quantity: number;
}

export interface Quote {
  readonly product: Product;
  readonly quantity: Quantity;
  readonly amounts: OrderAmounts;
}

/** Price breakdown shown in the summary: validates quantity and stock before pricing. */
export class GetQuote {
  constructor(
    private readonly products: ProductRepository,
    private readonly fees: FeePolicy,
  ) {}

  async execute(query: GetQuoteQuery): Promise<Result<Quote, DomainError>> {
    return await AsyncResult.from(Quantity.of(query.quantity))
      .andThen((quantity) => this.loadProduct(query.productId, quantity))
      .andThen(({ product, quantity }) =>
        map(product.ensureStockFor(quantity.value), () => ({ product, quantity })),
      )
      .andThen((order) => map(priceOrder(order, this.fees), (amounts) => ({ ...order, amounts })));
  }

  private async loadProduct(productId: string, quantity: Quantity) {
    const product = await this.products.findById(productId);
    return product
      ? ok({ product, quantity })
      : err({ code: 'PRODUCT_NOT_FOUND' as const, productId });
  }
}
