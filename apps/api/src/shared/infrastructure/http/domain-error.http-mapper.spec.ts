import { type DomainError } from '../../kernel/domain-error';
import { toProblem } from './domain-error.http-mapper';

describe('toProblem', () => {
  it.each<[DomainError, number]>([
    [{ code: 'VALIDATION_ERROR', details: [] }, 400],
    [{ code: 'PRODUCT_NOT_FOUND', productId: 'p' }, 404],
    [{ code: 'CUSTOMER_NOT_FOUND', customerId: 'c' }, 404],
    [{ code: 'TRANSACTION_NOT_FOUND', transactionId: 't' }, 404],
    [{ code: 'DELIVERY_NOT_FOUND', deliveryId: 'd' }, 404],
    [{ code: 'INSUFFICIENT_STOCK', available: 1, requested: 2 }, 409],
    [{ code: 'INVALID_STATE_TRANSITION', from: 'APPROVED', to: 'DECLINED' }, 409],
    [{ code: 'IDEMPOTENCY_CONFLICT', idempotencyKey: 'k' }, 422],
    [{ code: 'INVALID_EVENT_SIGNATURE' }, 401],
    [{ code: 'GATEWAY_REJECTED', reason: 'bad token' }, 502],
    [{ code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' }, 503],
  ])('should map %j to HTTP %i', (error, status) => {
    expect(toProblem(error).status).toBe(status);
  });

  it('should describe the resource that was not found', () => {
    expect(toProblem({ code: 'PRODUCT_NOT_FOUND', productId: 'abc' }).detail).toBe(
      'Product abc was not found',
    );
  });

  it('should expose validation details as an extension', () => {
    const details = [{ field: 'quantity', message: 'must be positive' }];

    expect(toProblem({ code: 'VALIDATION_ERROR', details }).extensions).toEqual({ details });
  });

  it('should not leak the gateway rejection reason to clients', () => {
    expect(
      toProblem({ code: 'GATEWAY_REJECTED', reason: 'internal merchant config' }).detail,
    ).not.toMatch(/merchant/);
  });

  it('should ask clients to retry later when the gateway is unavailable', () => {
    expect(toProblem({ code: 'GATEWAY_UNAVAILABLE', cause: 'NETWORK' }).headers).toEqual({
      'Retry-After': '5',
    });
  });
});
