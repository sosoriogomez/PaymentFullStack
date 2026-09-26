import { type Clock } from '../../../shared/kernel/ports';
import { ok, type Result } from '../../../shared/kernel/result';
import {
  type AcceptanceTokens,
  type CardChargeRequest,
  type GatewayError,
  type GatewayTransaction,
  type PaymentGateway,
} from '../domain/payment-gateway.port';

/**
 * Decorator: caches the acceptance tokens (the same for every customer) for a few minutes and
 * delegates everything else. Failed lookups are never cached.
 */
export class CachedAcceptanceGateway implements PaymentGateway {
  private cached: { readonly tokens: AcceptanceTokens; readonly expiresAt: number } | null = null;

  constructor(
    private readonly inner: PaymentGateway,
    private readonly clock: Clock,
    private readonly ttlMs: number,
  ) {}

  async getAcceptanceTokens(): Promise<Result<AcceptanceTokens, GatewayError>> {
    const now = this.clock.now().getTime();
    if (this.cached && now < this.cached.expiresAt) return ok(this.cached.tokens);
    const result = await this.inner.getAcceptanceTokens();
    if (result.ok) this.cached = { tokens: result.value, expiresAt: now + this.ttlMs };
    return result;
  }

  createCardTransaction(
    request: CardChargeRequest,
  ): Promise<Result<GatewayTransaction, GatewayError>> {
    return this.inner.createCardTransaction(request);
  }

  getTransaction(gatewayTransactionId: string): Promise<Result<GatewayTransaction, GatewayError>> {
    return this.inner.getTransaction(gatewayTransactionId);
  }

  findTransactionByReference(
    reference: string,
  ): Promise<Result<GatewayTransaction | null, GatewayError>> {
    return this.inner.findTransactionByReference(reference);
  }
}
