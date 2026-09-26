import { type DomainError } from '../../../shared/kernel/domain-error';
import { type Result } from '../../../shared/kernel/result';
import { type GatewayTransaction } from './payment-gateway.port';

export const TRANSACTION_UPDATED = 'transaction.updated';

/** A gateway event whose checksum was verified. `transaction` is set for transaction events. */
export interface GatewayEvent {
  readonly type: string;
  readonly transaction: GatewayTransaction | null;
}

export type EventVerificationError = Extract<
  DomainError,
  { code: 'INVALID_EVENT_SIGNATURE' | 'VALIDATION_ERROR' }
>;

/** Port: turns an untrusted webhook payload into a verified event, or rejects it. */
export interface PaymentEventVerifier {
  verify(payload: unknown, checksumHeader?: string): Result<GatewayEvent, EventVerificationError>;
}

export const PAYMENT_EVENT_VERIFIER = Symbol('PaymentEventVerifier');
