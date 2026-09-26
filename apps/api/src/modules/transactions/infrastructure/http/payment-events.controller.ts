import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { HandlePaymentEvent } from '../../application/handle-payment-event.use-case';

export const EVENT_CHECKSUM_HEADER = 'x-event-checksum';

export class PaymentEventReceipt {
  readonly received!: true;
}

/** Webhook of the gateway: authenticated by the event checksum, not by the caller. */
@Controller({ path: 'payment-events', version: '1' })
export class PaymentEventsController {
  constructor(private readonly handlePaymentEvent: HandlePaymentEvent) {}

  /** 200 for every authentic event (duplicates included); 401 when the checksum does not match. */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() payload: Record<string, unknown>,
    @Headers(EVENT_CHECKSUM_HEADER) checksumHeader?: string,
  ): Promise<PaymentEventReceipt> {
    unwrapOrThrow(await this.handlePaymentEvent.execute({ payload, checksumHeader }));
    return { received: true };
  }
}
