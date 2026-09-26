import { Controller, Get, Param } from '@nestjs/common';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { uuidParam } from '../../../../shared/infrastructure/http/uuid-param';
import { GetDelivery } from '../../application/get-delivery.use-case';
import { DeliveryResponse } from './delivery.response';

@Controller({ path: 'deliveries', version: '1' })
export class DeliveriesController {
  constructor(private readonly getDelivery: GetDelivery) {}

  @Get(':id')
  async get(@Param('id', uuidParam('id')) id: string): Promise<DeliveryResponse> {
    return DeliveryResponse.from(unwrapOrThrow(await this.getDelivery.execute(id)));
  }
}
