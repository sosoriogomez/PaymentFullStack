import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiProblems } from '../../../../shared/infrastructure/http/openapi';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { HandlePaymentEvent } from '../../application/handle-payment-event.use-case';
import { PaymentEventReceipt } from './payment-event.response';

export const EVENT_CHECKSUM_HEADER = 'x-event-checksum';

/** Webhook of the gateway: authenticated by the event checksum, not by the caller. */
// The gateway retries events it could not deliver: never rate limited (checksum-authenticated).
@SkipThrottle()
@ApiTags('payment-events')
@Controller({ path: 'payment-events', version: '1' })
export class PaymentEventsController {
  constructor(private readonly handlePaymentEvent: HandlePaymentEvent) {}

  /** 200 for every authentic event (duplicates included); 401 when the checksum does not match. */
  @ApiOperation({ summary: 'Receives transaction.updated events and finalizes the transaction' })
  @ApiHeader({
    name: EVENT_CHECKSUM_HEADER,
    required: false,
    description: 'Checksum, when it is not in the body (signature.checksum)',
  })
  @ApiProblems(400, 401, 413)
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
