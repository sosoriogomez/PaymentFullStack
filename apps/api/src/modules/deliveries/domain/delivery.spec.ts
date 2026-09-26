import { DELIVERY } from '../../../../test/builders/transaction.builder';
import { Delivery, type NewDelivery } from './delivery';

const input: NewDelivery = {
  id: '55555555-5555-4555-8555-555555555555',
  transactionId: '33333333-3333-4333-8333-333333333333',
  customerId: '11111111-1111-4111-8111-111111111111',
  productId: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e01',
  quantity: 2,
  address: DELIVERY,
  createdAt: new Date('2026-10-01T15:05:00.000Z'),
};

describe('Delivery', () => {
  it('should assign a delivery with the checkout address', () => {
    const delivery = Delivery.assign(input);

    expect(delivery.status).toBe('ASSIGNED');
    expect(delivery).toMatchObject({
      id: input.id,
      transactionId: input.transactionId,
      customerId: input.customerId,
      productId: input.productId,
      quantity: 2,
      address: DELIVERY,
      createdAt: input.createdAt,
    });
  });

  it('should backorder a delivery without units in stock', () => {
    expect(Delivery.backorder(input).status).toBe('BACKORDERED');
  });
});
