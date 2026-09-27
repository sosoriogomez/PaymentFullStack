import { Module } from '@nestjs/common';
import { AppConfigService } from '../../shared/infrastructure/config/app-config.service';
import { PAYMENT_EVENT_VERIFIER } from './domain/payment-event.port';
import { PAYMENT_GATEWAY } from './domain/payment-gateway.port';
import { ChecksumPaymentEventVerifier } from './infrastructure/checksum-payment-event.verifier';
import { HttpPaymentGatewayAdapter } from './infrastructure/http-payment-gateway.adapter';

@Module({
  providers: [
    {
      // No cache in front: every acceptance token carries its own `jit` and is spent by the
      // transaction that uses it, so each checkout needs a fresh one (I-25).
      provide: PAYMENT_GATEWAY,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new HttpPaymentGatewayAdapter(config.paymentGateway),
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
