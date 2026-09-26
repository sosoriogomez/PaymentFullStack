import { inCents } from '../../../checkout/domain/order-amounts';
import { type TransactionView } from '../../application/transaction-views';
import { type TransactionStatus } from '../../domain/transaction-status';

/** Amounts in integer cents; the API computed them (the client never sends amounts). */
export class TransactionAmountsResponse {
  readonly product!: number;
  readonly baseFee!: number;
  readonly deliveryFee!: number;
  readonly total!: number;
  readonly currency!: string;
}

/** Only brand and last four digits, as reported by the gateway. */
export class CardResponse {
  readonly brand!: string;
  readonly lastFour!: string;
}

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
  readonly amounts!: TransactionAmountsResponse;
  readonly product!: TransactionProductResponse;
  readonly card!: CardResponse | null;
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
