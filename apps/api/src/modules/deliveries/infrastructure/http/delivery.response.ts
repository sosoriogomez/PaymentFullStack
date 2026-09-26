import { maskPhone } from '../../../../shared/infrastructure/http/masking';
import { type Delivery, type DeliveryStatus } from '../../domain/delivery';

export class DeliveryRecipientResponse {
  readonly name!: string;
  /** Masked (`***4567`): an id is enough to read this resource (OWASP API3). */
  readonly phone!: string;
}

export class DeliveryAddressResponse {
  readonly addressLine1!: string;
  readonly addressLine2!: string | null;
  readonly city!: string;
  readonly region!: string;
  readonly country!: string;
  readonly postalCode!: string | null;
}

export class DeliveryResponse {
  readonly id!: string;
  readonly transactionId!: string;
  readonly productId!: string;
  readonly quantity!: number;
  readonly status!: DeliveryStatus;
  readonly recipient!: DeliveryRecipientResponse;
  readonly address!: DeliveryAddressResponse;
  readonly createdAt!: string;

  static from(delivery: Delivery): DeliveryResponse {
    const { address } = delivery;
    return {
      id: delivery.id,
      transactionId: delivery.transactionId,
      productId: delivery.productId,
      quantity: delivery.quantity,
      status: delivery.status,
      recipient: { name: address.recipientName, phone: maskPhone(address.recipientPhone) },
      address: {
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 ?? null,
        city: address.city,
        region: address.region,
        country: address.country,
        postalCode: address.postalCode ?? null,
      },
      createdAt: delivery.createdAt.toISOString(),
    };
  }
}
