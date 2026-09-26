import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  type AlertContext,
  type AlertLog,
  type Clock,
  type Hasher,
  type IdGenerator,
} from '../../kernel/ports';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** UUID v4: identifiers that cannot be enumerated (OWASP API1). */
export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
}

export class Sha256Hasher implements Hasher {
  sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}

/** Anomalies go to the application log with a stable `alert` field, easy to search for. */
export class LoggerAlertLog implements AlertLog {
  private readonly logger = new Logger('Alerts');

  warn(event: string, context: AlertContext): void {
    this.logger.warn(JSON.stringify({ alert: event, ...context }));
  }

  error(event: string, context: AlertContext): void {
    this.logger.error(JSON.stringify({ alert: event, ...context }));
  }
}
