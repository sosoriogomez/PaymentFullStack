import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { ProductsModule } from './modules/products/products.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ConfigModule } from './shared/infrastructure/config/config.module';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { HttpInfrastructureModule } from './shared/infrastructure/http/http.module';
import { KernelModule } from './shared/infrastructure/kernel/kernel.module';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';

@Module({
  imports: [
    ConfigModule,
    KernelModule,
    LoggingModule,
    HttpInfrastructureModule,
    DatabaseModule,
    HealthModule,
    ProductsModule,
    CheckoutModule,
    CustomersModule,
    TransactionsModule,
    DeliveriesModule,
  ],
})
export class AppModule {}
