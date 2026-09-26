import { inCents, type OrderAmountsInCents } from '../../../checkout/domain/order-amounts';
import { type TransactionView } from '../../application/transaction-views';
import { type CardSummary } from '../../domain/transaction';
import { type TransactionStatus } from '../../domain/transaction-status';

export class TransactionProductResponse {
  readonly id!: string;
  readonly name!: string;
  readonly quantity!: number;
}

/** Never includes card tokens, acceptance tokens or the shipping address. */
export class TransactionResponse {
  readonly id!: string;
  readonly reference!: string;
  readonly status!: TransactionStatus;
  readonly statusMessage!: string | null;
  readonly amounts!: OrderAmountsInCents;
  readonly product!: TransactionProductResponse;
  readonly card!: CardSummary | null;
  readonly deliveryId!: string | null;
  readonly createdAt!: string;

  static from({ transaction, product, deliveryId }: TransactionView): TransactionResponse {
    return {
      id: transaction.id,
      reference: transaction.reference,
      status: transaction.status,
      statusMessage: transaction.statusMessage,
      amounts: inCents(transaction.amounts),
      product: { ...product, quantity: transaction.quantity },
      card: transaction.card,
      deliveryId,
      createdAt: transaction.createdAt.toISOString(),
    };
  }
}
