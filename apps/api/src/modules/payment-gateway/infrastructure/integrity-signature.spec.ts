import { integritySignature } from './integrity-signature';

describe('integritySignature', () => {
  const charge = {
    reference: 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W',
    amountInCents: 16_300_000,
    currency: 'COP',
  };

  it('should match a known vector: sha256(reference + amount + currency + secret)', () => {
    expect(integritySignature(charge, 'test_integrity_secret')).toBe(
      'c829289b48e64100867a8e3551fa657e2d2faa837cf49285a8c1b2c29905fadd',
    );
  });

  it('should change when the amount changes (tampering is detected)', () => {
    expect(integritySignature({ ...charge, amountInCents: 100 }, 'test_integrity_secret')).not.toBe(
      integritySignature(charge, 'test_integrity_secret'),
    );
  });
});
