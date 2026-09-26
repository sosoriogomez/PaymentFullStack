import { type Clock, type Hasher, type IdGenerator } from '../../src/shared/kernel/ports';
import { Sha256Hasher } from '../../src/shared/infrastructure/kernel/kernel-adapters';

export const NOW = new Date('2026-10-01T15:00:00.000Z');

export class FixedClock implements Clock {
  constructor(private current: Date = NOW) {}

  now(): Date {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Deterministic UUID v4 values: 00000000-0000-4000-8000-000000000001, …0002, … */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  uuid(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

export class SequentialReferences {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `TX-TEST${String(this.counter).padStart(4, '0')}`;
  }
}

export const hasher: Hasher = new Sha256Hasher();
