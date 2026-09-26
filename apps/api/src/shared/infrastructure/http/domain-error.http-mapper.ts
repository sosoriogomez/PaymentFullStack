import { HttpStatus } from '@nestjs/common';
import { type DomainError, type DomainErrorCode } from '../../kernel/domain-error';

export interface ProblemMapping {
  readonly status: number;
  readonly detail: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly headers?: Readonly<Record<string, string>>;
}

type ErrorOf<C extends DomainErrorCode> = Extract<DomainError, { code: C }>;

/** One entry per code: the mapped type makes a new code without mapping a compile error (M-10). */
type ProblemTable = { readonly [C in DomainErrorCode]: (error: ErrorOf<C>) => ProblemMapping };

const GATEWAY_RETRY_AFTER_SECONDS = '5';

const PROBLEMS: ProblemTable = {
  VALIDATION_ERROR: (e) => ({
    status: HttpStatus.BAD_REQUEST,
    detail: 'The request is not valid',
    extensions: { details: e.details },
  }),
  PRODUCT_NOT_FOUND: (e) => ({
    status: HttpStatus.NOT_FOUND,
    detail: `Product ${e.productId} was not found`,
  }),
  CUSTOMER_NOT_FOUND: (e) => ({
    status: HttpStatus.NOT_FOUND,
    detail: `Customer ${e.customerId} was not found`,
  }),
  TRANSACTION_NOT_FOUND: (e) => ({
    status: HttpStatus.NOT_FOUND,
    detail: `No transaction with ${e.by} ${e.value}`,
  }),
  DELIVERY_NOT_FOUND: (e) => ({
    status: HttpStatus.NOT_FOUND,
    detail: `Delivery ${e.deliveryId} was not found`,
  }),
  INSUFFICIENT_STOCK: (e) => ({
    status: HttpStatus.CONFLICT,
    detail: `Only ${e.available} units available`,
    extensions: { available: e.available, requested: e.requested },
  }),
  INVALID_STATE_TRANSITION: (e) => ({
    status: HttpStatus.CONFLICT,
    detail: `Cannot move a transaction from ${e.from} to ${e.to}`,
  }),
  IDEMPOTENCY_CONFLICT: () => ({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: 'The Idempotency-Key was already used with a different request',
  }),
  INVALID_EVENT_SIGNATURE: () => ({
    status: HttpStatus.UNAUTHORIZED,
    detail: 'The event signature is not valid',
  }),
  // The rejection reason is logged, never returned: it may contain gateway internals.
  GATEWAY_REJECTED: () => ({
    status: HttpStatus.BAD_GATEWAY,
    detail: 'The payment gateway rejected the operation',
  }),
  GATEWAY_UNAVAILABLE: () => ({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    detail: 'The payment gateway is not available, try again later',
    headers: { 'Retry-After': GATEWAY_RETRY_AFTER_SECONDS },
  }),
};

/** The single place that decides the HTTP status of each domain error. */
export function toProblem(error: DomainError): ProblemMapping {
  const mapping = PROBLEMS[error.code] as (error: DomainError) => ProblemMapping;
  return mapping(error);
}
