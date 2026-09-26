import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ConfigModule } from './shared/infrastructure/config/config.module';
import { KernelModule } from './shared/infrastructure/kernel/kernel.module';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';

/** Application context of the scheduled reconciliation: no HTTP layer (and no CDN guard). */
@Module({
  imports: [ConfigModule, KernelModule, LoggingModule, DatabaseModule, TransactionsModule],
})
export class ReconcileModule {}
