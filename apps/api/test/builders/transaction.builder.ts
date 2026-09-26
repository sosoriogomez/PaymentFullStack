import { type PaymentCredentials } from '../../src/modules/transactions/application/create-transaction.use-case';
import { type ShippingAddressInput } from '../../src/modules/transactions/domain/shipping-address';
import {
  Transaction,
  type TransactionProps,
} from '../../src/modules/transactions/domain/transaction';
import { CUSTOMER_ID } from './customer.builder';
import { cop, PRODUCT_ID } from './product.builder';

export const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
export const IDEMPOTENCY_KEY = '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f';

export const DELIVERY: ShippingAddressInput = {
  recipientName: 'Ana Pérez',
  recipientPhone: '3001234567',
  addressLine1: 'Cra 43A # 1-50',
  addressLine2: 'Apto 301',
  city: 'Medellín',
  region: 'Antioquia',
  country: 'CO',
  postalCode: '050021',
};

export const PAYMENT: PaymentCredentials = {
  cardToken: 'tok_test_card',
  installments: 1,
  acceptanceToken: 'acceptance-token',
  acceptPersonalAuth: 'personal-data-token',
};

/** Test data builder: `aTransaction().withStatus('APPROVED').build()` (1 unit of 150.000 COP). */
export class TransactionBuilder {
  private props: TransactionProps = {
    id: TRANSACTION_ID,
    reference: 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W',
    productId: PRODUCT_ID,
    customerId: CUSTOMER_ID,
    quantity: 1,
    amounts: {
      product: cop(150_000_00),
      baseFee: cop(3_000_00),
      deliveryFee: cop(10_000_00),
      total: cop(163_000_00),
    },
    installments: 1,
    shipping: DELIVERY,
    idempotencyKey: IDEMPOTENCY_KEY,
    requestHash: 'a'.repeat(64),
    status: 'PENDING',
    statusMessage: null,
    gatewayTransactionId: null,
    card: null,
    finalizedAt: null,
    createdAt: new Date('2026-10-01T15:00:00.000Z'),
  };

  with(changes: Partial<TransactionProps>): this {
    this.props = { ...this.props, ...changes };
    return this;
  }

  build(): Transaction {
    return Transaction.restore(this.props);
  }
}

export const aTransaction = (): TransactionBuilder => new TransactionBuilder();
