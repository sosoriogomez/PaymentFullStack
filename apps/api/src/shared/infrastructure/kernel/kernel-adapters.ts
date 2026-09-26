import { createHash, randomUUID } from 'node:crypto';
import { type Clock, type Hasher, type IdGenerator } from '../../kernel/ports';

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
