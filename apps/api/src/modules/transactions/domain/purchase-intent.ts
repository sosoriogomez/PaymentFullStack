import { canonicalJson } from '../../../shared/kernel/canonical-json';
import { type Hasher } from '../../../shared/kernel/ports';
import { type ShippingAddressInput } from './shipping-address';

/**
 * What the customer wants to buy, i.e. what an Idempotency-Key protects (ADR-006). One-time
 * credentials (card token and acceptance tokens) are left out on purpose: they change every time
 * the card is entered again after a refresh, but the purchase is the same one (C-04).
 */
export interface PurchaseIntent {
  readonly productId: string;
  readonly quantity: number;
  readonly customerId: string;
  readonly installments: number;
  readonly delivery: ShippingAddressInput;
}

/** SHA-256 of the canonical JSON (sorted keys): the `request_hash` of a transaction. */
export const purchaseFingerprint = (intent: PurchaseIntent, hasher: Hasher): string =>
  hasher.sha256(
    canonicalJson({
      productId: intent.productId,
      quantity: intent.quantity,
      customerId: intent.customerId,
      installments: intent.installments,
      delivery: { ...intent.delivery },
    }),
  );
