import { Module } from '@nestjs/common';
import { ConfigModule } from './shared/infrastructure/config/config.module';
import { HealthModule } from './shared/infrastructure/health/health.module';

@Module({
  imports: [ConfigModule, HealthModule],
})
export class AppModule {}
