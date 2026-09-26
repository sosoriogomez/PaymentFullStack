export const DELIVERY_STATUSES = ['ASSIGNED', 'BACKORDERED'] as const;
/** ASSIGNED: units reserved for shipping. BACKORDERED: paid but a concurrent purchase took them. */
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface DeliveryAddress {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string | undefined;
  readonly city: string;
  readonly region: string;
  readonly country: string;
  readonly postalCode?: string | undefined;
}

export interface NewDelivery {
  readonly id: string;
  readonly transactionId: string;
  readonly customerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly address: DeliveryAddress;
  readonly createdAt: Date;
}

export interface DeliveryProps extends NewDelivery {
  readonly status: DeliveryStatus;
}

/** Shipment of an APPROVED transaction, with the address captured at checkout. */
export class Delivery {
  private constructor(private readonly props: DeliveryProps) {}

  static assign(input: NewDelivery): Delivery {
    return new Delivery({ ...input, status: 'ASSIGNED' });
  }

  static backorder(input: NewDelivery): Delivery {
    return new Delivery({ ...input, status: 'BACKORDERED' });
  }

  /** Rebuilds a delivery from persisted, trusted data. */
  static restore(props: DeliveryProps): Delivery {
    return new Delivery(props);
  }

  get id(): string {
    return this.props.id;
  }

  get transactionId(): string {
    return this.props.transactionId;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get productId(): string {
    return this.props.productId;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get address(): DeliveryAddress {
    return this.props.address;
  }

  get status(): DeliveryStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
