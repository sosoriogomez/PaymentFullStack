import { type DomainError } from '../../../shared/kernel/domain-error';
import { type Money } from '../../../shared/kernel/money';
import { type Result } from '../../../shared/kernel/result';
import { type Product } from '../../products/domain/product';
import { type Quantity } from './quantity';

export interface OrderDraft {
  readonly product: Product;
  readonly quantity: Quantity;
}

export interface Fees {
  readonly baseFee: Money;
  readonly deliveryFee: Money;
}

/** Strategy: how much the base fee and the delivery cost (flat today, per city tomorrow). */
export interface FeePolicy {
  feesFor(order: OrderDraft): Result<Fees, DomainError>;
}

export const FEE_POLICY = Symbol('FeePolicy');
