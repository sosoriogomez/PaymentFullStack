import { eventChecksum } from './event-checksum';

describe('eventChecksum', () => {
  const event = {
    data: {
      transaction: { id: '1234-1610641025-49201', status: 'APPROVED', amount_in_cents: 4_490_000 },
    },
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
    timestamp: 1_530_291_411,
  };

  it('should hash the signed properties in order, the timestamp and the secret', () => {
    // sha256('1234-1610641025-49201' + 'APPROVED' + '4490000' + '1530291411' + secret)
    expect(eventChecksum(event, 'test-events-secret')).toBe(
      '3dab86791917ab4d7cc1e5cb8057a8bf31e58f60bee8ddbbbd71f9454cd4c7ad',
    );
  });

  it('should change when a signed value changes', () => {
    const tampered = {
      ...event,
      data: { transaction: { ...event.data.transaction, amount_in_cents: 100 } },
    };

    expect(eventChecksum(tampered, 'test-events-secret')).not.toBe(
      eventChecksum(event, 'test-events-secret'),
    );
  });

  it('should treat a missing or non-scalar property as empty', () => {
    const withMissing = {
      ...event,
      properties: ['transaction.missing', 'transaction', 'nope.deep'],
    };

    expect(eventChecksum(withMissing, 's')).toBe(eventChecksum({ ...event, properties: [] }, 's'));
  });
});
