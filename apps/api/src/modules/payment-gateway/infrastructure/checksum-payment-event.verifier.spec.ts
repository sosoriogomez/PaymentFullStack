import { EVENTS_SECRET, signedEvent } from '../../../../test/support/payment-events';
import { ChecksumPaymentEventVerifier } from './checksum-payment-event.verifier';

const transaction = {
  id: 'gw-1',
  reference: 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W',
  status: 'APPROVED',
  amount_in_cents: 16_300_000,
};

describe('ChecksumPaymentEventVerifier', () => {
  const verifier = new ChecksumPaymentEventVerifier(EVENTS_SECRET);

  it('should accept an authentic transaction event and map its transaction', () => {
    const result = verifier.verify(signedEvent(transaction));

    expect(result.ok && result.value).toEqual({
      type: 'transaction.updated',
      transaction: {
        id: 'gw-1',
        reference: transaction.reference,
        status: 'APPROVED',
        statusMessage: null,
        amountInCents: 16_300_000,
        currency: 'COP',
        card: null,
      },
    });
  });

  it('should accept the checksum in lower case or in the X-Event-Checksum header', () => {
    const event = signedEvent(transaction);
    const { checksum } = event.signature;

    const lower = verifier.verify({
      ...event,
      signature: { ...event.signature, checksum: checksum.toLowerCase() },
    });
    const header = verifier.verify(
      { ...event, signature: { properties: event.signature.properties } },
      checksum,
    );

    expect(lower.ok).toBe(true);
    expect(header.ok).toBe(true);
  });

  it.each([
    [
      'a tampered amount',
      () => {
        const event = signedEvent(transaction);
        return {
          ...event,
          data: { transaction: { ...event.data.transaction, amount_in_cents: 1 } },
        };
      },
    ],
    ['another secret', () => signedEvent(transaction, { secret: 'someone-else' })],
    [
      'no checksum at all',
      () => {
        const event = signedEvent(transaction);
        return { ...event, signature: { properties: event.signature.properties } };
      },
    ],
  ])('should reject %s as INVALID_EVENT_SIGNATURE', (_, build) => {
    const result = verifier.verify(build());

    expect(!result.ok && result.error).toEqual({ code: 'INVALID_EVENT_SIGNATURE' });
  });

  it.each([
    null,
    'text',
    { event: 'transaction.updated' },
    { ...signedEvent(transaction), timestamp: 'x' },
  ])('should reject the malformed payload %p as a VALIDATION_ERROR', (payload) => {
    const result = verifier.verify(payload);

    expect(!result.ok && result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should report other authentic events without a transaction', () => {
    const result = verifier.verify(signedEvent(transaction, { event: 'payment_link.updated' }));

    expect(result.ok && result.value).toEqual({ type: 'payment_link.updated', transaction: null });
  });

  it('should reject an authentic transaction event without a valid transaction', () => {
    const event = signedEvent(transaction);
    const broken = {
      ...event,
      data: { transaction: { ...event.data.transaction, currency: 'PESOS' } },
    };

    const result = verifier.verify(broken);

    expect(!result.ok && result.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'data.transaction' }],
    });
  });
});
