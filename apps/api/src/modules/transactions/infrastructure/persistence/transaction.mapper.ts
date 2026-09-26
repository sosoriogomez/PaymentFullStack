import { trusted } from '../../../../shared/infrastructure/database/trusted';
import { Money } from '../../../../shared/kernel/money';
import { Transaction } from '../../domain/transaction';
import { type TransactionOrmEntity } from './transaction.orm-entity';

export type TransactionRow = Omit<TransactionOrmEntity, 'updatedAt'>;

const money = (cents: number, row: TransactionRow, what: string): Money =>
  trusted(Money.of(cents, row.currency), `${what} of transaction ${row.id}`);

export const toTransaction = (row: TransactionRow): Transaction =>
  Transaction.restore({
    id: row.id,
    reference: row.reference,
    productId: row.productId,
    customerId: row.customerId,
    quantity: row.quantity,
    amounts: {
      product: money(row.productAmountInCents, row, 'product amount'),
      baseFee: money(row.baseFeeInCents, row, 'base fee'),
      deliveryFee: money(row.deliveryFeeInCents, row, 'delivery fee'),
      total: money(row.totalAmountInCents, row, 'total'),
    },
    installments: row.installments,
    shipping: row.shippingSnapshot,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    status: row.status,
    statusMessage: row.statusMessage,
    gatewayTransactionId: row.gatewayTransactionId,
    card:
      row.cardBrand && row.cardLastFour
        ? { brand: row.cardBrand, lastFour: row.cardLastFour }
        : null,
    finalizedAt: row.finalizedAt,
    createdAt: row.createdAt,
  });

export const toRow = (transaction: Transaction): TransactionRow => ({
  id: transaction.id,
  reference: transaction.reference,
  productId: transaction.productId,
  customerId: transaction.customerId,
  quantity: transaction.quantity,
  productAmountInCents: transaction.amounts.product.amountInCents,
  baseFeeInCents: transaction.amounts.baseFee.amountInCents,
  deliveryFeeInCents: transaction.amounts.deliveryFee.amountInCents,
  totalAmountInCents: transaction.amounts.total.amountInCents,
  currency: transaction.amounts.total.currency,
  status: transaction.status,
  statusMessage: transaction.statusMessage,
  gatewayTransactionId: transaction.gatewayTransactionId,
  cardBrand: transaction.card?.brand ?? null,
  cardLastFour: transaction.card?.lastFour ?? null,
  installments: transaction.installments,
  idempotencyKey: transaction.idempotencyKey,
  requestHash: transaction.requestHash,
  shippingSnapshot: transaction.shipping,
  finalizedAt: transaction.finalizedAt,
  createdAt: transaction.createdAt,
});
