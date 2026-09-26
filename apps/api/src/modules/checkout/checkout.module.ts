import { Module } from '@nestjs/common';
import { AppConfigService } from '../../shared/infrastructure/config/app-config.service';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../products/domain/product.repository.port';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from '../payment-gateway/domain/payment-gateway.port';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { ProductsModule } from '../products/products.module';
import { GetAcceptance } from './application/get-acceptance.use-case';
import { GetQuote } from './application/get-quote.use-case';
import { FEE_POLICY, type FeePolicy } from './domain/fee-policy.port';
import { FlatFeePolicy } from './domain/flat-fee.policy';
import { CheckoutController } from './infrastructure/http/checkout.controller';

@Module({
  imports: [ProductsModule, PaymentGatewayModule],
  controllers: [CheckoutController],
  providers: [
    {
      provide: FEE_POLICY,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => new FlatFeePolicy(config.pricing),
    },
    {
      provide: GetQuote,
      inject: [PRODUCT_REPOSITORY, FEE_POLICY],
      useFactory: (products: ProductRepository, fees: FeePolicy) => new GetQuote(products, fees),
    },
    {
      provide: GetAcceptance,
      inject: [PAYMENT_GATEWAY],
      useFactory: (gateway: PaymentGateway) => new GetAcceptance(gateway),
    },
  ],
  exports: [FEE_POLICY],
})
export class CheckoutModule {}
