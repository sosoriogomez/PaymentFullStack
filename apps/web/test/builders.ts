import {
  type Delivery,
  type OrderAmounts,
  type Product,
  type Transaction,
} from '@/shared/api/contracts';

export const PRODUCT_ID = '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e01';
export const TRANSACTION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const DELIVERY_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

export const aProduct = (overrides: Partial<Product> = {}): Product => ({
  id: PRODUCT_ID,
  name: 'Audífonos inalámbricos Pulse',
  description: 'Cancelación activa de ruido y 30 horas de batería.',
  priceInCents: 150_000_00,
  currency: 'COP',
  stock: 5,
  imageKey: 'wireless-headphones',
  ...overrides,
});

export const someAmounts = (overrides: Partial<OrderAmounts> = {}): OrderAmounts => ({
  product: 150_000_00,
  baseFee: 3_000_00,
  deliveryFee: 10_000_00,
  total: 163_000_00,
  currency: 'COP',
  ...overrides,
});

export const aTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: TRANSACTION_ID,
  reference: 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W',
  status: 'PENDING',
  statusMessage: null,
  amounts: someAmounts(),
  product: { id: PRODUCT_ID, name: 'Audífonos inalámbricos Pulse', quantity: 1 },
  card: { brand: 'VISA', lastFour: '4242' },
  deliveryId: null,
  createdAt: '2026-10-01T15:00:00.000Z',
  ...overrides,
});

export const aDelivery = (overrides: Partial<Delivery> = {}): Delivery => ({
  id: DELIVERY_ID,
  transactionId: TRANSACTION_ID,
  status: 'ASSIGNED',
  quantity: 1,
  recipientName: 'Ana Pérez',
  recipientPhone: '***4567',
  addressLine1: 'Cra 43A # 1-50',
  addressLine2: 'Apto 301',
  city: 'Medellín',
  region: 'Antioquia',
  country: 'CO',
  postalCode: '050021',
  ...overrides,
});
