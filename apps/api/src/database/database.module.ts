import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppConfigService } from '../shared/infrastructure/config/app-config.service';
import { TypeOrmUnitOfWork } from '../shared/infrastructure/database/typeorm-unit-of-work';
import { UNIT_OF_WORK } from '../shared/kernel/unit-of-work';
import { buildDataSourceOptions } from './data-source-options';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        ...buildDataSourceOptions(config.database),
        retryAttempts: 2,
        retryDelay: 500,
      }),
    }),
  ],
  providers: [
    {
      provide: UNIT_OF_WORK,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => new TypeOrmUnitOfWork(dataSource),
    },
  ],
  exports: [UNIT_OF_WORK],
})
export class DatabaseModule {}
