import { err, ok } from '../../kernel/result';
import { DomainErrorException } from './domain-error.exception';
import { unwrapOrThrow } from './unwrap';

describe('unwrapOrThrow', () => {
  it('should return the value of an ok result', () => {
    expect(unwrapOrThrow(ok(42))).toBe(42);
  });

  it('should throw a DomainErrorException carrying the error', () => {
    const error = { code: 'PRODUCT_NOT_FOUND', productId: 'p1' } as const;

    expect(() => unwrapOrThrow(err(error))).toThrow(DomainErrorException);
    try {
      unwrapOrThrow(err(error));
    } catch (thrown) {
      expect((thrown as DomainErrorException).error).toBe(error);
      expect((thrown as DomainErrorException).message).toBe('PRODUCT_NOT_FOUND');
    }
  });
});
