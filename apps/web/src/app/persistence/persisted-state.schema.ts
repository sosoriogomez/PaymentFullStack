import { z } from 'zod';
import { CHECKOUT_STEPS } from '@/features/checkout/checkout.slice';
import { deliverySchema, orderAmountsSchema, transactionSchema } from '@/shared/api/contracts';

export const PERSISTED_STATE_VERSION = 1;

/**
 * What survives a refresh. Deliberately absent: the card token and its expiry, the acceptance
 * tokens (they must be accepted again) and every in-flight request status (ADR-002).
 */
export const persistedCheckoutSchema = z.object({
  step: z.enum(CHECKOUT_STEPS),
  productId: z.string().nullable(),
  quantity: z.number().int().positive(),
  contact: z.object({ fullName: z.string(), email: z.string(), phone: z.string() }),
  delivery: z.object({
    addressLine1: z.string(),
    addressLine2: z.string(),
    city: z.string(),
    region: z.string(),
    postalCode: z.string(),
  }),
  customerId: z.string().nullable(),
  card: z.object({ brand: z.string(), lastFour: z.string(), holderName: z.string() }).nullable(),
  installments: z.number().int().positive(),
  quote: orderAmountsSchema.nullable(),
  idempotencyKey: z.string().nullable(),
  cardReentryRequired: z.boolean(),
});

export const persistedTransactionSchema = z.object({
  current: transactionSchema.nullable(),
  delivery: deliverySchema.nullable(),
});

export const persistedEnvelopeSchema = z.object({
  version: z.literal(PERSISTED_STATE_VERSION),
  savedAt: z.number().int(),
  data: z.object({
    checkout: persistedCheckoutSchema,
    transaction: persistedTransactionSchema,
  }),
});

export type PersistedCheckout = z.infer<typeof persistedCheckoutSchema>;
export type PersistedTransaction = z.infer<typeof persistedTransactionSchema>;
export type PersistedEnvelope = z.infer<typeof persistedEnvelopeSchema>;
