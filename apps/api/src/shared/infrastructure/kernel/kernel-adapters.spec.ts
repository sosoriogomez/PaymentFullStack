import { Logger } from '@nestjs/common';
import { CryptoIdGenerator, LoggerAlertLog, Sha256Hasher, SystemClock } from './kernel-adapters';

describe('kernel adapters', () => {
  it('should read the system time', () => {
    const before = Date.now();

    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
  });

  it('should generate UUID v4 identifiers', () => {
    expect(new CryptoIdGenerator().uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('should hash with SHA-256 in hex', () => {
    expect(new Sha256Hasher().sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('should log alerts as JSON with a stable alert field', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const alerts = new LoggerAlertLog();

    alerts.warn('BACKORDERED', { transactionId: 't1', quantity: 2 });
    alerts.error('AMOUNT_MISMATCH', { transactionId: 't1' });

    expect(warn).toHaveBeenCalledWith('{"alert":"BACKORDERED","transactionId":"t1","quantity":2}');
    expect(error).toHaveBeenCalledWith('{"alert":"AMOUNT_MISMATCH","transactionId":"t1"}');
  });
});
