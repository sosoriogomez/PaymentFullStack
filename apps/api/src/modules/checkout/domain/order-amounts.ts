import { type DomainError } from '../../../shared/kernel/domain-error';
import { Money } from '../../../shared/kernel/money';
import { andThen, map, type Result } from '../../../shared/kernel/result';
import { type FeePolicy, type OrderDraft } from './fee-policy.port';

export interface OrderAmounts {
  readonly product: Money;
  readonly baseFee: Money;
  readonly deliveryFee: Money;
  readonly total: Money;
}

export interface OrderAmountsInCents {
  readonly product: number;
  readonly baseFee: number;
  readonly deliveryFee: number;
  readonly total: number;
  readonly currency: string;
}

/**
 * total = price × quantity + base fee + delivery fee, in integer cents. The backend always
 * computes it; the frontend never sends amounts.
 */
export const priceOrder = (order: OrderDraft, fees: FeePolicy): Result<OrderAmounts, DomainError> =>
  andThen(order.product.price.multiply(order.quantity.value), (product) =>
    andThen(fees.feesFor(order), ({ baseFee, deliveryFee }) =>
      map(Money.sum(product, baseFee, deliveryFee), (total) => ({
        product,
        baseFee,
        deliveryFee,
        total,
      })),
    ),
  );

export const inCents = (amounts: OrderAmounts): OrderAmountsInCents => ({
  product: amounts.product.amountInCents,
  baseFee: amounts.baseFee.amountInCents,
  deliveryFee: amounts.deliveryFee.amountInCents,
  total: amounts.total.amountInCents,
  currency: amounts.total.currency,
});
