import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ProductsModule } from './modules/products/products.module';
import { ConfigModule } from './shared/infrastructure/config/config.module';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { HttpInfrastructureModule } from './shared/infrastructure/http/http.module';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    HttpInfrastructureModule,
    DatabaseModule,
    HealthModule,
    ProductsModule,
  ],
})
export class AppModule {}
