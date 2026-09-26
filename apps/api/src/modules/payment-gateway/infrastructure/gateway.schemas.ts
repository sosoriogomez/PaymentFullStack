import { z } from 'zod';

/**
 * Anti-corruption layer: the gateway speaks snake_case with many optional extras. Only what we
 * use is validated (`unknown` → typed); everything else is ignored.
 */
export const merchantResponseSchema = z.object({
  data: z.object({
    presigned_acceptance: z.object({ acceptance_token: z.string().min(1), permalink: z.url() }),
    presigned_personal_data_auth: z.object({
      acceptance_token: z.string().min(1),
      permalink: z.url(),
    }),
  }),
});

export const gatewayTransactionSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  status: z.string().min(1),
  status_message: z.string().nullish(),
  amount_in_cents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  payment_method: z
    .object({
      extra: z
        .object({ brand: z.string().optional(), last_four: z.string().optional() })
        .loose()
        .nullish(),
    })
    .loose()
    .nullish(),
});
export type RawGatewayTransaction = z.infer<typeof gatewayTransactionSchema>;

export const transactionResponseSchema = z.object({ data: gatewayTransactionSchema });
export const transactionListResponseSchema = z.object({ data: z.array(gatewayTransactionSchema) });

export const gatewayErrorBodySchema = z.object({
  error: z
    .object({
      type: z.string().optional(),
      reason: z.string().optional(),
      messages: z.record(z.string(), z.unknown()).optional(),
    })
    .loose(),
});
