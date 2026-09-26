import { DomainErrorException } from './domain-error.exception';
import { parseIdempotencyKey } from './idempotency-key';

describe('parseIdempotencyKey', () => {
  it('should accept a UUID v4 and normalize it to lower case', () => {
    expect(parseIdempotencyKey('7B1D3F0E-8C2A-4B5D-9E6F-0A1B2C3D4E5F')).toBe(
      '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f',
    );
  });

  it.each([undefined, '', 'abc', '7b1d3f0e-8c2a-1b5d-9e6f-0a1b2c3d4e5f'])(
    'should reject %p as a VALIDATION_ERROR on the header',
    (value) => {
      expect(() => parseIdempotencyKey(value)).toThrow(DomainErrorException);
      try {
        parseIdempotencyKey(value);
      } catch (error) {
        expect((error as DomainErrorException).error).toEqual({
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'Idempotency-Key', message: 'header is required and must be a UUID v4' },
          ],
        });
      }
    },
  );
});
