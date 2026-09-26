import { Logger } from '@nestjs/common';
import { type z } from 'zod';
import { type PaymentGatewaySettings } from '../../../shared/infrastructure/config/app-config.service';
import { err, map, ok, type Result } from '../../../shared/kernel/result';
import {
  type AcceptanceTokens,
  type CardChargeRequest,
  type GatewayError,
  type GatewayTransaction,
  type PaymentGateway,
} from '../domain/payment-gateway.port';
import {
  rejectionReason,
  toAcceptanceTokens,
  toChargeBody,
  toGatewayTransaction,
} from './gateway.mapper';
import {
  gatewayErrorBodySchema,
  merchantResponseSchema,
  type RawGatewayTransaction,
  transactionListResponseSchema,
  transactionResponseSchema,
} from './gateway.schemas';
import { integritySignature } from './integrity-signature';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface TransportOptions {
  readonly fetchFn?: FetchFn;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}

interface GatewayRequest<T> {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly schema: z.ZodType<T>;
  readonly authenticated: boolean;
  readonly body?: unknown;
}

type UnavailableCause = Extract<GatewayError, { code: 'GATEWAY_UNAVAILABLE' }>['cause'];

const BACKOFF_BASE_MS = 200;
const BACKOFF_JITTER_MS = 100;

const unavailable = (cause: UnavailableCause): GatewayError => ({
  code: 'GATEWAY_UNAVAILABLE',
  cause,
});
const isRetryable = (error: GatewayError): boolean =>
  error.code === 'GATEWAY_UNAVAILABLE' && error.cause !== 'BAD_RESPONSE';
const isAbort = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ['AbortError', 'TimeoutError'].includes((error as Error).name);
const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * HTTP adapter of the payment gateway (I-02): POST once with an 8 s timeout (a charge is never
 * retried automatically); GET with 4 s per attempt, up to 2 retries with exponential backoff and
 * jitter, all inside a 12 s deadline that fits in the Lambda timeout.
 */
export class HttpPaymentGatewayAdapter implements PaymentGateway {
  private readonly logger = new Logger(HttpPaymentGatewayAdapter.name);
  private readonly fetchFn: FetchFn;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(
    private readonly settings: PaymentGatewaySettings,
    options: TransportOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  async getAcceptanceTokens(): Promise<Result<AcceptanceTokens, GatewayError>> {
    const path = `/merchants/${encodeURIComponent(this.settings.publicKey)}`;
    return map(
      await this.send({
        method: 'GET',
        path,
        schema: merchantResponseSchema,
        authenticated: false,
      }),
      toAcceptanceTokens,
    );
  }

  async createCardTransaction(
    request: CardChargeRequest,
  ): Promise<Result<GatewayTransaction, GatewayError>> {
    const body = toChargeBody(request, integritySignature(request, this.settings.integritySecret));
    const result = await this.send({
      method: 'POST',
      path: '/transactions',
      schema: transactionResponseSchema,
      authenticated: true,
      body,
    });
    return map(result, (response) => this.toTransaction(response.data));
  }

  async getTransaction(
    gatewayTransactionId: string,
  ): Promise<Result<GatewayTransaction, GatewayError>> {
    const path = `/transactions/${encodeURIComponent(gatewayTransactionId)}`;
    const result = await this.send({
      method: 'GET',
      path,
      schema: transactionResponseSchema,
      authenticated: true,
    });
    return map(result, (response) => this.toTransaction(response.data));
  }

  async findTransactionByReference(
    reference: string,
  ): Promise<Result<GatewayTransaction | null, GatewayError>> {
    const path = `/transactions?reference=${encodeURIComponent(reference)}`;
    const result = await this.send({
      method: 'GET',
      path,
      schema: transactionListResponseSchema,
      authenticated: true,
    });
    return map(result, (response) => {
      const [first] = response.data;
      return first ? this.toTransaction(first) : null;
    });
  }

  private toTransaction(raw: RawGatewayTransaction): GatewayTransaction {
    const { transaction, unknownStatus } = toGatewayTransaction(raw);
    if (unknownStatus)
      this.logger.warn(
        `Unknown gateway status "${unknownStatus}" for ${raw.reference}: kept as PENDING`,
      );
    return transaction;
  }

  private async send<T>(request: GatewayRequest<T>): Promise<Result<T, GatewayError>> {
    const isRead = request.method === 'GET';
    const attempts = isRead ? 1 + this.settings.getMaxRetries : 1;
    const timeoutMs = isRead ? this.settings.getTimeoutMs : this.settings.postTimeoutMs;
    const deadline = AbortSignal.timeout(this.settings.deadlineMs);
    for (let attempt = 1; ; attempt += 1) {
      const result = await this.attempt(
        request,
        AbortSignal.any([deadline, AbortSignal.timeout(timeoutMs)]),
      );
      if (result.ok || !isRetryable(result.error) || deadline.aborted || attempt >= attempts)
        return result;
      await this.sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1) + this.random() * BACKOFF_JITTER_MS);
    }
  }

  private async attempt<T>(
    request: GatewayRequest<T>,
    signal: AbortSignal,
  ): Promise<Result<T, GatewayError>> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.settings.baseUrl}${request.path}`, {
        method: request.method,
        headers: this.headersFor(request),
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal,
      });
    } catch (error) {
      return err(unavailable(isAbort(error) ? 'TIMEOUT' : 'NETWORK'));
    }
    if (response.status >= 500) return err(unavailable('HTTP_5XX'));
    if (response.status >= 400) {
      const reason = rejectionReason(response.status, await this.readErrorBody(response));
      this.logger.warn(
        `Gateway rejected ${request.method} ${request.path.split('?')[0] ?? ''}: ${reason}`,
      );
      return err({ code: 'GATEWAY_REJECTED', reason });
    }
    return this.parse(response, request);
  }

  private async parse<T>(
    response: Response,
    request: GatewayRequest<T>,
  ): Promise<Result<T, GatewayError>> {
    const parsed = request.schema.safeParse(await response.json().catch(() => undefined));
    if (parsed.success) return ok(parsed.data);
    this.logger.warn(
      `Unexpected gateway response to ${request.method} ${request.path.split('?')[0] ?? ''}`,
    );
    return err(unavailable('BAD_RESPONSE'));
  }

  private async readErrorBody(response: Response) {
    const parsed = gatewayErrorBodySchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? parsed.data : null;
  }

  private headersFor(request: GatewayRequest<unknown>): Record<string, string> {
    return {
      Accept: 'application/json',
      ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(request.authenticated ? { Authorization: `Bearer ${this.settings.privateKey}` } : {}),
    };
  }
}
