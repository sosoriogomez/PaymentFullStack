import { Delivery } from '../../domain/delivery';
import { type DeliveryOrmEntity } from './delivery.orm-entity';

export const toDelivery = (row: DeliveryOrmEntity): Delivery =>
  Delivery.restore({
    id: row.id,
    transactionId: row.transactionId,
    customerId: row.customerId,
    productId: row.productId,
    quantity: row.quantity,
    address: {
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2 ?? undefined,
      city: row.city,
      region: row.region,
      country: row.country,
      postalCode: row.postalCode ?? undefined,
    },
    status: row.status,
    createdAt: row.createdAt,
  });

export const toDeliveryRow = (delivery: Delivery): DeliveryOrmEntity => ({
  id: delivery.id,
  transactionId: delivery.transactionId,
  customerId: delivery.customerId,
  productId: delivery.productId,
  quantity: delivery.quantity,
  recipientName: delivery.address.recipientName,
  recipientPhone: delivery.address.recipientPhone,
  addressLine1: delivery.address.addressLine1,
  addressLine2: delivery.address.addressLine2 ?? null,
  city: delivery.address.city,
  region: delivery.address.region,
  country: delivery.address.country,
  postalCode: delivery.address.postalCode ?? null,
  status: delivery.status,
  createdAt: delivery.createdAt,
});
