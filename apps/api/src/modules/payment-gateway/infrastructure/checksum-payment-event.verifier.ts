import { type z } from 'zod';
import { constantTimeEquals } from '../../../shared/infrastructure/crypto/constant-time';
import { err, ok, type Result } from '../../../shared/kernel/result';
import {
  type EventVerificationError,
  type GatewayEvent,
  type PaymentEventVerifier,
  TRANSACTION_UPDATED,
} from '../domain/payment-event.port';
import { eventChecksum } from './event-checksum';
import { gatewayEventSchema, transactionEventDataSchema } from './gateway-event.schemas';
import { toGatewayTransaction } from './gateway.mapper';

const invalidSignature: EventVerificationError = { code: 'INVALID_EVENT_SIGNATURE' };
const malformed = (field: string, message: string): EventVerificationError => ({
  code: 'VALIDATION_ERROR',
  details: [{ field, message }],
});

/**
 * Verifies webhook events with the events secret (timing-safe) before anything reads them.
 * The checksum travels in the body (`signature.checksum`) or in the X-Event-Checksum header.
 */
export class ChecksumPaymentEventVerifier implements PaymentEventVerifier {
  constructor(private readonly eventsSecret: string) {}

  verify(payload: unknown, checksumHeader?: string): Result<GatewayEvent, EventVerificationError> {
    const parsed = gatewayEventSchema.safeParse(payload);
    if (!parsed.success) return err(malformed('event', 'is not a gateway event'));
    const event = parsed.data;
    const received = event.signature.checksum ?? checksumHeader;
    if (!received || !this.isAuthentic(event, received)) return err(invalidSignature);
    return event.event === TRANSACTION_UPDATED
      ? this.transactionEvent(event)
      : ok({ type: event.event, transaction: null });
  }

  private isAuthentic(event: z.infer<typeof gatewayEventSchema>, received: string): boolean {
    const expected = eventChecksum(
      { data: event.data, properties: event.signature.properties, timestamp: event.timestamp },
      this.eventsSecret,
    );
    return constantTimeEquals(received.toLowerCase(), expected);
  }

  private transactionEvent(
    event: z.infer<typeof gatewayEventSchema>,
  ): Result<GatewayEvent, EventVerificationError> {
    const data = transactionEventDataSchema.safeParse(event.data);
    if (!data.success) return err(malformed('data.transaction', 'is not a transaction'));
    const { transaction } = toGatewayTransaction(data.data.transaction);
    return ok({ type: event.event, transaction });
  }
}
