import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../../shared/infrastructure/http/openapi';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { uuidParam } from '../../../../shared/infrastructure/http/uuid-param';
import { GetDelivery } from '../../application/get-delivery.use-case';
import { DeliveryResponse } from './delivery.response';

@ApiTags('deliveries')
@ApiProblems(429)
@Controller({ path: 'deliveries', version: '1' })
export class DeliveriesController {
  constructor(private readonly getDelivery: GetDelivery) {}

  @ApiOperation({ summary: 'Delivery of an approved transaction (recipient phone masked)' })
  @ApiProblems(400, 404)
  @Get(':id')
  async get(@Param('id', uuidParam('id')) id: string): Promise<DeliveryResponse> {
    return DeliveryResponse.from(unwrapOrThrow(await this.getDelivery.execute(id)));
  }
}
