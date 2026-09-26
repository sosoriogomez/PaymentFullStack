import { Module } from '@nestjs/common';
import { AppConfigService } from '../../shared/infrastructure/config/app-config.service';
import { CLOCK, type Clock } from '../../shared/kernel/ports';
import { PAYMENT_EVENT_VERIFIER } from './domain/payment-event.port';
import { PAYMENT_GATEWAY } from './domain/payment-gateway.port';
import { ChecksumPaymentEventVerifier } from './infrastructure/checksum-payment-event.verifier';
import { CachedAcceptanceGateway } from './infrastructure/cached-acceptance.gateway';
import { HttpPaymentGatewayAdapter } from './infrastructure/http-payment-gateway.adapter';

const MS_PER_SECOND = 1000;

@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [AppConfigService, CLOCK],
      useFactory: (config: AppConfigService, clock: Clock) =>
        new CachedAcceptanceGateway(
          new HttpPaymentGatewayAdapter(config.paymentGateway),
          clock,
          config.paymentGateway.acceptanceCacheTtlSeconds * MS_PER_SECOND,
        ),
    },
    {
      provide: PAYMENT_EVENT_VERIFIER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new ChecksumPaymentEventVerifier(config.paymentGateway.eventsSecret),
    },
  ],
  exports: [PAYMENT_GATEWAY, PAYMENT_EVENT_VERIFIER],
})
export class PaymentGatewayModule {}
