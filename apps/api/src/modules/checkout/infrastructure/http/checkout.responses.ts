import { type OrderAmountsInCents } from '../../domain/order-amounts';

export class AmountsResponse implements OrderAmountsInCents {
  readonly product!: number;
  readonly baseFee!: number;
  readonly deliveryFee!: number;
  readonly total!: number;
  readonly currency!: string;
}

export class QuoteResponse {
  readonly productId!: string;
  readonly quantity!: number;
  readonly amounts!: AmountsResponse;
}
