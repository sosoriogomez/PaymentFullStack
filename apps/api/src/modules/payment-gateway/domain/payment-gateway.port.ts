import { type DomainError } from '../../../shared/kernel/domain-error';
import { type Result } from '../../../shared/kernel/result';

export const GATEWAY_STATUSES = ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'] as const;
export type GatewayTransactionStatus = (typeof GATEWAY_STATUSES)[number];

export type FinalGatewayStatus = Exclude<GatewayTransactionStatus, 'PENDING'>;

export const isFinalGatewayStatus = (
  status: GatewayTransactionStatus,
): status is FinalGatewayStatus => status !== 'PENDING';

/** Contracts the customer must accept explicitly before paying (privacy policy and personal data). */
export interface AcceptanceTokens {
  readonly acceptanceToken: string;
  readonly acceptancePermalink: string;
  readonly personalDataAuthToken: string;
  readonly personalDataAuthPermalink: string;
}

export interface ShippingAddress {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string | undefined;
  readonly city: string;
  readonly region: string;
  readonly country: string;
  readonly postalCode?: string | undefined;
}

export interface CardChargeRequest {
  readonly reference: string;
  readonly amountInCents: number;
  readonly currency: string;
  readonly customerEmail: string;
  readonly customer: { readonly fullName: string; readonly phone: string };
  readonly cardToken: string;
  readonly installments: number;
  readonly acceptanceToken: string;
  readonly acceptPersonalAuth: string;
  readonly shipping: ShippingAddress;
}

export interface GatewayTransaction {
  readonly id: string;
  readonly reference: string;
  readonly status: GatewayTransactionStatus;
  readonly statusMessage: string | null;
  readonly amountInCents: number;
  readonly currency: string;
  readonly card: { readonly brand: string; readonly lastFour: string } | null;
}

/** A charge the gateway already settled: APPROVED, DECLINED, VOIDED or ERROR. */
export type FinalGatewayTransaction = GatewayTransaction & { readonly status: FinalGatewayStatus };

export const isFinalGatewayTransaction = (
  transaction: GatewayTransaction,
): transaction is FinalGatewayTransaction => isFinalGatewayStatus(transaction.status);

export type GatewayError = Extract<
  DomainError,
  { code: 'GATEWAY_UNAVAILABLE' | 'GATEWAY_REJECTED' }
>;

/** Port of the payment gateway (sandbox): the only way the domain talks to it. */
export interface PaymentGateway {
  getAcceptanceTokens(): Promise<Result<AcceptanceTokens, GatewayError>>;
  createCardTransaction(
    request: CardChargeRequest,
  ): Promise<Result<GatewayTransaction, GatewayError>>;
  getTransaction(gatewayTransactionId: string): Promise<Result<GatewayTransaction, GatewayError>>;
  findTransactionByReference(
    reference: string,
  ): Promise<Result<GatewayTransaction | null, GatewayError>>;
}

export const PAYMENT_GATEWAY = Symbol('PaymentGateway');
