import { z } from 'zod';
import { gatewayTransactionSchema } from './gateway.schemas';

/** Envelope of a webhook event; the payload inside `data` depends on the event type. */
export const gatewayEventSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  signature: z.object({
    properties: z.array(z.string().min(1)).min(1),
    checksum: z.string().optional(),
  }),
  timestamp: z.number().int().nonnegative(),
});

export const transactionEventDataSchema = z.object({ transaction: gatewayTransactionSchema });
