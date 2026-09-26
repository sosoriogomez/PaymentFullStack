export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/** Every expected failure of the domain, as a discriminated union (never loose strings). */
export type DomainError =
  | { readonly code: 'VALIDATION_ERROR'; readonly details: readonly FieldError[] }
  | { readonly code: 'PRODUCT_NOT_FOUND'; readonly productId: string }
  | { readonly code: 'CUSTOMER_NOT_FOUND'; readonly customerId: string }
  | {
      readonly code: 'TRANSACTION_NOT_FOUND';
      readonly by: 'id' | 'idempotencyKey';
      readonly value: string;
    }
  | { readonly code: 'DELIVERY_NOT_FOUND'; readonly deliveryId: string }
  | { readonly code: 'INSUFFICIENT_STOCK'; readonly available: number; readonly requested: number }
  | { readonly code: 'IDEMPOTENCY_CONFLICT'; readonly idempotencyKey: string }
  | { readonly code: 'INVALID_STATE_TRANSITION'; readonly from: string; readonly to: string }
  | { readonly code: 'INVALID_EVENT_SIGNATURE' }
  | {
      readonly code: 'GATEWAY_UNAVAILABLE';
      readonly cause: 'TIMEOUT' | 'NETWORK' | 'HTTP_5XX' | 'BAD_RESPONSE';
    }
  | { readonly code: 'GATEWAY_REJECTED'; readonly reason: string };

export type DomainErrorCode = DomainError['code'];

export const validationError = (field: string, message: string): DomainError => ({
  code: 'VALIDATION_ERROR',
  details: [{ field, message }],
});
