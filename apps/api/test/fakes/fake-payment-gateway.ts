import {
  type AcceptanceTokens,
  type CardChargeRequest,
  type GatewayError,
  type GatewayTransaction,
  type GatewayTransactionStatus,
  type PaymentGateway,
} from '../../src/modules/payment-gateway/domain/payment-gateway.port';
import { err, ok, type Result } from '../../src/shared/kernel/result';

export const FAKE_ACCEPTANCE: AcceptanceTokens = {
  acceptanceToken: 'fake-acceptance-token',
  acceptancePermalink: 'https://gateway.test/terms/privacy.pdf',
  personalDataAuthToken: 'fake-personal-data-token',
  personalDataAuthPermalink: 'https://gateway.test/terms/personal-data.pdf',
};

export const FAKE_CARD = { brand: 'VISA', lastFour: '4242' } as const;

export type GatewayOperation = 'acceptance' | 'charge' | 'read';

/** How the next charges behave. The real gateway answers PENDING and settles a moment later. */
export interface ChargePlan {
  readonly initial: GatewayTransactionStatus;
  /** Status reached on the first read after the charge. */
  readonly settlesTo?: GatewayTransactionStatus;
  /** The gateway records the charge but the response never arrives (timeout after the POST). */
  readonly responseLost?: boolean;
  /** Amount the gateway reports, to simulate a tampered or inconsistent charge (I-06). */
  readonly reportedAmountInCents?: number;
}

interface StoredTransaction {
  transaction: GatewayTransaction;
  settlesTo: GatewayTransactionStatus | undefined;
}

const TIMEOUT: GatewayError = { code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' };

/**
 * In-memory payment gateway with scripted outcomes. It records every charge so tests can assert
 * what was sent (and that a charge was never repeated).
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly charges: CardChargeRequest[] = [];
  private plan: ChargePlan = { initial: 'PENDING', settlesTo: 'APPROVED' };
  private readonly failures = new Map<GatewayOperation, GatewayError>();
  private readonly byId = new Map<string, StoredTransaction>();

  willCharge(plan: ChargePlan): this {
    this.plan = plan;
    return this;
  }

  failOn(operation: GatewayOperation, error: GatewayError): this {
    this.failures.set(operation, error);
    return this;
  }

  recover(): this {
    this.failures.clear();
    return this;
  }

  /** Moves a recorded transaction to a final status, as the gateway would do on its own. */
  settle(reference: string, status: GatewayTransactionStatus): void {
    const stored = this.findStored(reference);
    if (!stored) throw new Error(`No fake gateway transaction for ${reference}`);
    stored.transaction = { ...stored.transaction, status };
    stored.settlesTo = undefined;
  }

  getAcceptanceTokens(): Promise<Result<AcceptanceTokens, GatewayError>> {
    return this.answer('acceptance', () => FAKE_ACCEPTANCE);
  }

  createCardTransaction(
    request: CardChargeRequest,
  ): Promise<Result<GatewayTransaction, GatewayError>> {
    const failure = this.failures.get('charge');
    if (failure) return Promise.resolve(err(failure));
    this.charges.push(request);
    const transaction = this.record(request);
    return Promise.resolve(this.plan.responseLost ? err(TIMEOUT) : ok(transaction));
  }

  getTransaction(gatewayTransactionId: string): Promise<Result<GatewayTransaction, GatewayError>> {
    const failure = this.failures.get('read');
    if (failure) return Promise.resolve(err(failure));
    const stored = this.byId.get(gatewayTransactionId);
    return Promise.resolve(
      stored ? ok(this.read(stored)) : err({ code: 'GATEWAY_REJECTED', reason: 'NOT_FOUND' }),
    );
  }

  findTransactionByReference(
    reference: string,
  ): Promise<Result<GatewayTransaction | null, GatewayError>> {
    return this.answer('read', () => {
      const stored = this.findStored(reference);
      return stored ? this.read(stored) : null;
    });
  }

  private answer<T>(operation: GatewayOperation, value: () => T): Promise<Result<T, GatewayError>> {
    const failure = this.failures.get(operation);
    return Promise.resolve(failure ? err(failure) : ok(value()));
  }

  private record(request: CardChargeRequest): GatewayTransaction {
    const transaction: GatewayTransaction = {
      id: `fake-${String(this.byId.size + 1).padStart(4, '0')}`,
      reference: request.reference,
      status: this.plan.initial,
      statusMessage: null,
      amountInCents: this.plan.reportedAmountInCents ?? request.amountInCents,
      currency: request.currency,
      card: FAKE_CARD,
    };
    this.byId.set(transaction.id, { transaction, settlesTo: this.plan.settlesTo });
    return transaction;
  }

  private read(stored: StoredTransaction): GatewayTransaction {
    if (stored.settlesTo) {
      stored.transaction = { ...stored.transaction, status: stored.settlesTo };
      stored.settlesTo = undefined;
    }
    return stored.transaction;
  }

  private findStored(reference: string): StoredTransaction | undefined {
    return [...this.byId.values()].find((stored) => stored.transaction.reference === reference);
  }
}
