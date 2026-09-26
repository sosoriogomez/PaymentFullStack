import { type DomainError } from '../../../shared/kernel/domain-error';
import { err, ok, type Result } from '../../../shared/kernel/result';
import { type Delivery } from '../domain/delivery';
import { type DeliveryRepository } from '../domain/delivery.repository.port';

export class GetDelivery {
  constructor(private readonly deliveries: DeliveryRepository) {}

  async execute(deliveryId: string): Promise<Result<Delivery, DomainError>> {
    const delivery = await this.deliveries.findById(deliveryId);
    return delivery ? ok(delivery) : err({ code: 'DELIVERY_NOT_FOUND', deliveryId });
  }
}
