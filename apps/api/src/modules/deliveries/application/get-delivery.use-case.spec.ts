import { DELIVERY } from '../../../../test/builders/transaction.builder';
import { InMemoryDeliveryRepository } from '../../../../test/fakes/in-memory-delivery.repository';
import { Delivery } from '../domain/delivery';
import { GetDelivery } from './get-delivery.use-case';

const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';

describe('GetDelivery', () => {
  it('should return a stored delivery', async () => {
    const deliveries = new InMemoryDeliveryRepository();
    const delivery = Delivery.assign({
      id: DELIVERY_ID,
      transactionId: '33333333-3333-4333-8333-333333333333',
      customerId: '11111111-1111-4111-8111-111111111111',
      productId: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e01',
      quantity: 1,
      address: DELIVERY,
      createdAt: new Date('2026-10-01T15:05:00.000Z'),
    });
    await deliveries.save(delivery);

    const result = await new GetDelivery(deliveries).execute(DELIVERY_ID);

    expect(result.ok && result.value).toBe(delivery);
  });

  it('should answer DELIVERY_NOT_FOUND for an unknown id', async () => {
    const result = await new GetDelivery(new InMemoryDeliveryRepository()).execute(DELIVERY_ID);

    expect(!result.ok && result.error).toEqual({
      code: 'DELIVERY_NOT_FOUND',
      deliveryId: DELIVERY_ID,
    });
  });
});
