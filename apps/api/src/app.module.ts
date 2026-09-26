import { Module } from '@nestjs/common';
import { ConfigModule } from './shared/infrastructure/config/config.module';
import { HealthModule } from './shared/infrastructure/health/health.module';
import { HttpInfrastructureModule } from './shared/infrastructure/http/http.module';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';

@Module({
  imports: [ConfigModule, LoggingModule, HttpInfrastructureModule, HealthModule],
})
export class AppModule {}
