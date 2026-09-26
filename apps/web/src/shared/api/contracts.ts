import { z } from 'zod';

/**
 * Contract of the Checkout API (spec-backend §5). Responses are validated at the boundary:
 * the app only works with data that matches these schemas.
 */
export const TRANSACTION_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

const cents = z.number().int().nonnegative();
const currency = z.string().length(3);

export const orderAmountsSchema = z.object({
  product: cents,
  baseFee: cents,
  deliveryFee: cents,
  total: cents,
  currency,
});
export type OrderAmounts = z.infer<typeof orderAmountsSchema>;

export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceInCents: cents,
  currency,
  stock: z.number().int().nonnegative(),
  imageKey: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const productListSchema = z.object({ items: z.array(productSchema) });

export const stockSchema = z.object({
  productId: z.uuid(),
  available: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type Stock = z.infer<typeof stockSchema>;

export const quoteSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().positive(),
  amounts: orderAmountsSchema,
});
export type Quote = z.infer<typeof quoteSchema>;

export const acceptanceSchema = z.object({
  acceptanceToken: z.string().min(1),
  acceptancePermalink: z.url(),
  personalDataAuthToken: z.string().min(1),
  personalDataAuthPermalink: z.url(),
});
export type Acceptance = z.infer<typeof acceptanceSchema>;

export const customerSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

export const transactionSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: transactionStatusSchema,
  statusMessage: z.string().nullable(),
  amounts: orderAmountsSchema,
  product: z.object({ id: z.uuid(), name: z.string(), quantity: z.number().int().positive() }),
  card: z.object({ brand: z.string(), lastFour: z.string() }).nullable(),
  deliveryId: z.uuid().nullable(),
  createdAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const deliverySchema = z.object({
  id: z.uuid(),
  transactionId: z.uuid(),
  status: z.enum(['ASSIGNED', 'BACKORDERED']),
  quantity: z.number().int().positive(),
  recipientName: z.string(),
  recipientPhone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  city: z.string(),
  region: z.string(),
  country: z.string(),
  postalCode: z.string().nullable(),
});
export type Delivery = z.infer<typeof deliverySchema>;

export const problemSchema = z.looseObject({
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
});

export interface CustomerInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
}

export interface DeliveryInput {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly city: string;
  readonly region: string;
  readonly country: 'CO';
  readonly postalCode?: string;
}

export interface CreateTransactionInput {
  readonly productId: string;
  readonly quantity: number;
  readonly customerId: string;
  readonly delivery: DeliveryInput;
  readonly payment: {
    readonly cardToken: string;
    readonly installments: number;
    readonly acceptanceToken: string;
    readonly acceptPersonalAuth: string;
  };
}
