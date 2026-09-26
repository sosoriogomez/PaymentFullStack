import { type z } from 'zod';
import {
  type AcceptanceTokens,
  type CardChargeRequest,
  GATEWAY_STATUSES,
  type GatewayTransaction,
  type GatewayTransactionStatus,
} from '../domain/payment-gateway.port';
import {
  type gatewayErrorBodySchema,
  type merchantResponseSchema,
  type RawGatewayTransaction,
} from './gateway.schemas';

export const COLOMBIA_DIALING_CODE = '57';

const isKnownStatus = (status: string): status is GatewayTransactionStatus =>
  (GATEWAY_STATUSES as readonly string[]).includes(status);

export interface MappedTransaction {
  readonly transaction: GatewayTransaction;
  /** Raw status when the gateway sent one we do not know (kept as PENDING, logged as warning). */
  readonly unknownStatus: string | null;
}

const cardOf = (raw: RawGatewayTransaction): GatewayTransaction['card'] => {
  const extra = raw.payment_method?.extra;
  return extra?.brand && extra.last_four ? { brand: extra.brand, lastFour: extra.last_four } : null;
};

export function toGatewayTransaction(raw: RawGatewayTransaction): MappedTransaction {
  const known = isKnownStatus(raw.status) ? raw.status : null;
  return {
    transaction: {
      id: raw.id,
      reference: raw.reference,
      status: known ?? 'PENDING',
      statusMessage: raw.status_message ?? null,
      amountInCents: raw.amount_in_cents,
      currency: raw.currency,
      card: cardOf(raw),
    },
    unknownStatus: known ? null : raw.status,
  };
}

export const toAcceptanceTokens = ({
  data,
}: z.infer<typeof merchantResponseSchema>): AcceptanceTokens => ({
  acceptanceToken: data.presigned_acceptance.acceptance_token,
  acceptancePermalink: data.presigned_acceptance.permalink,
  personalDataAuthToken: data.presigned_personal_data_auth.acceptance_token,
  personalDataAuthPermalink: data.presigned_personal_data_auth.permalink,
});

/** Body of `POST /transactions` (I-19: customer phone with the dialing code, shipping phone national). */
export const toChargeBody = (request: CardChargeRequest, signature: string) => ({
  acceptance_token: request.acceptanceToken,
  accept_personal_auth: request.acceptPersonalAuth,
  amount_in_cents: request.amountInCents,
  currency: request.currency,
  signature,
  customer_email: request.customerEmail,
  reference: request.reference,
  payment_method: { type: 'CARD', token: request.cardToken, installments: request.installments },
  customer_data: {
    full_name: request.customer.fullName,
    phone_number: `${COLOMBIA_DIALING_CODE}${request.customer.phone}`,
  },
  shipping_address: {
    address_line_1: request.shipping.addressLine1,
    ...(request.shipping.addressLine2 ? { address_line_2: request.shipping.addressLine2 } : {}),
    country: request.shipping.country,
    region: request.shipping.region,
    city: request.shipping.city,
    name: request.shipping.recipientName,
    phone_number: request.shipping.recipientPhone,
    ...(request.shipping.postalCode ? { postal_code: request.shipping.postalCode } : {}),
  },
});

/** Short, log-safe reason of a 4xx answer (never the request body). */
export function rejectionReason(
  status: number,
  body: z.infer<typeof gatewayErrorBodySchema> | null,
): string {
  if (!body) return `HTTP ${status}`;
  const fields = Object.keys(body.error.messages ?? {});
  const detail =
    body.error.reason ?? (fields.length > 0 ? `invalid ${fields.join(', ')}` : undefined);
  return [body.error.type ?? `HTTP ${status}`, detail].filter(Boolean).join(': ');
}
