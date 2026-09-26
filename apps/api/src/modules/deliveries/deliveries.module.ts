import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GetDelivery } from './application/get-delivery.use-case';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from './domain/delivery.repository.port';
import { DeliveriesController } from './infrastructure/http/deliveries.controller';
import { TypeOrmDeliveryRepository } from './infrastructure/persistence/typeorm-delivery.repository';

@Module({
  controllers: [DeliveriesController],
  providers: [
    {
      provide: DELIVERY_REPOSITORY,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmDeliveryRepository(ds),
    },
    {
      provide: GetDelivery,
      inject: [DELIVERY_REPOSITORY],
      useFactory: (deliveries: DeliveryRepository) => new GetDelivery(deliveries),
    },
  ],
  exports: [DELIVERY_REPOSITORY],
})
export class DeliveriesModule {}
