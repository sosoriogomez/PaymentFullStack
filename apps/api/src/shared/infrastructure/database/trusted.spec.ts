import { err, ok } from '../../kernel/result';
import { trusted } from './trusted';

describe('trusted', () => {
  it('should unwrap valid persisted values', () => {
    expect(trusted(ok(5), 'stock')).toBe(5);
  });

  it('should fail loudly on corrupted values', () => {
    expect(() => trusted(err({ code: 'VALIDATION_ERROR' }), 'product price')).toThrow(
      'Corrupted persisted data: product price ({"code":"VALIDATION_ERROR"})',
    );
  });
});
