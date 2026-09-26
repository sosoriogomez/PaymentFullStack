import { type DeliveryRepository } from '../../deliveries/domain/delivery.repository.port';
import { type ProductRepository } from '../../products/domain/product.repository.port';
import { type Transaction } from '../domain/transaction';

/** What the client shows about a transaction: the aggregate plus product name and delivery. */
export interface TransactionView {
  readonly transaction: Transaction;
  readonly product: { readonly id: string; readonly name: string };
  readonly deliveryId: string | null;
}

export class TransactionViews {
  constructor(
    private readonly products: ProductRepository,
    private readonly deliveries: DeliveryRepository,
  ) {}

  async of(transaction: Transaction): Promise<TransactionView> {
    const product = await this.products.findById(transaction.productId);
    if (!product) {
      throw new Error(`Product ${transaction.productId} of ${transaction.id} is missing`);
    }
    return {
      transaction,
      product: { id: product.id, name: product.name },
      deliveryId: await this.deliveryIdOf(transaction),
    };
  }

  /** Only APPROVED transactions get a delivery (finalization). */
  private deliveryIdOf(transaction: Transaction): Promise<string | null> {
    return transaction.status === 'APPROVED'
      ? this.deliveries.findIdByTransactionId(transaction.id)
      : Promise.resolve(null);
  }
}
