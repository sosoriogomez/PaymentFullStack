import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DELIVERY_REPOSITORY } from './domain/delivery.repository.port';
import { TypeOrmDeliveryRepository } from './infrastructure/persistence/typeorm-delivery.repository';

@Module({
  providers: [
    {
      provide: DELIVERY_REPOSITORY,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmDeliveryRepository(ds),
    },
  ],
  exports: [DELIVERY_REPOSITORY],
})
export class DeliveriesModule {}
