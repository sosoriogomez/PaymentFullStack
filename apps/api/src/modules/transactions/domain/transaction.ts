import { type DomainError, validationError } from '../../../shared/kernel/domain-error';
import { Money } from '../../../shared/kernel/money';
import { andThen, err, ok, type Result } from '../../../shared/kernel/result';
import { type OrderAmounts } from '../../checkout/domain/order-amounts';
import { type Quantity } from '../../checkout/domain/quantity';
import { type Installments } from './installments';
import { type ShippingAddress, type ShippingSnapshot } from './shipping-address';
import { type FinalStatus, isFinalStatus, type TransactionStatus } from './transaction-status';

/** The only currency the gateway charges in. */
export const TRANSACTION_CURRENCY = 'COP';
/** Length of the `status_message` column. */
export const MAX_STATUS_MESSAGE_LENGTH = 255;

export interface CardSummary {
  readonly brand: string;
  readonly lastFour: string;
}

export interface TransactionProps {
  readonly id: string;
  readonly reference: string;
  readonly productId: string;
  readonly customerId: string;
  readonly quantity: number;
  readonly amounts: OrderAmounts;
  readonly installments: number;
  readonly shipping: ShippingSnapshot;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly status: TransactionStatus;
  readonly statusMessage: string | null;
  readonly gatewayTransactionId: string | null;
  readonly card: CardSummary | null;
  readonly finalizedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewTransaction {
  readonly id: string;
  readonly reference: string;
  readonly productId: string;
  readonly customerId: string;
  readonly quantity: Quantity;
  readonly amounts: OrderAmounts;
  readonly installments: Installments;
  readonly shipping: ShippingAddress;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly createdAt: Date;
}

export interface GatewayCharge {
  readonly gatewayTransactionId: string;
  readonly card: CardSummary | null;
}

export interface FinalOutcome {
  readonly status: FinalStatus;
  readonly statusMessage: string | null;
  readonly card?: CardSummary | null;
}

export type InvalidStateTransition = Extract<DomainError, { code: 'INVALID_STATE_TRANSITION' }>;

const ensureConsistentAmounts = (amounts: OrderAmounts): Result<OrderAmounts, DomainError> =>
  andThen(Money.sum(amounts.product, amounts.baseFee, amounts.deliveryFee), (sum) => {
    if (amounts.total.currency !== TRANSACTION_CURRENCY) {
      return err(validationError('currency', `must be ${TRANSACTION_CURRENCY}`));
    }
    return sum.equals(amounts.total)
      ? ok(amounts)
      : err(validationError('amounts', 'the total must be the sum of its components'));
  });

/**
 * Aggregate root of a purchase. State machine: PENDING → APPROVED | DECLINED | VOIDED | ERROR,
 * and final states never change. Every change returns a new instance.
 */
export class Transaction {
  private constructor(private readonly props: TransactionProps) {}

  static createPending(input: NewTransaction): Result<Transaction, DomainError> {
    return andThen(ensureConsistentAmounts(input.amounts), (amounts) =>
      ok(
        new Transaction({
          ...input,
          amounts,
          quantity: input.quantity.value,
          installments: input.installments.value,
          shipping: input.shipping.snapshot,
          status: 'PENDING',
          statusMessage: null,
          gatewayTransactionId: null,
          card: null,
          finalizedAt: null,
        }),
      ),
    );
  }

  /** Rebuilds a transaction from persisted, trusted data. */
  static restore(props: TransactionProps): Transaction {
    return new Transaction(props);
  }

  get id(): string {
    return this.props.id;
  }

  get reference(): string {
    return this.props.reference;
  }

  get productId(): string {
    return this.props.productId;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get amounts(): OrderAmounts {
    return this.props.amounts;
  }

  get installments(): number {
    return this.props.installments;
  }

  get shipping(): ShippingSnapshot {
    return this.props.shipping;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get requestHash(): string {
    return this.props.requestHash;
  }

  get status(): TransactionStatus {
    return this.props.status;
  }

  get statusMessage(): string | null {
    return this.props.statusMessage;
  }

  get gatewayTransactionId(): string | null {
    return this.props.gatewayTransactionId;
  }

  get card(): CardSummary | null {
    return this.props.card;
  }

  get finalizedAt(): Date | null {
    return this.props.finalizedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get isFinal(): boolean {
    return isFinalStatus(this.props.status);
  }

  /** Same Idempotency-Key and same purchase intent (ADR-006). */
  isSameRequest(requestHash: string): boolean {
    return this.props.requestHash === requestHash;
  }

  /**
   * The gateway accepted the charge. The status stays PENDING even if the gateway already knows
   * the outcome: only FinalizeTransaction confirms it, together with the stock and the delivery.
   */
  recordCharge(charge: GatewayCharge): Result<Transaction, InvalidStateTransition> {
    return andThen(this.ensurePending('PENDING'), () =>
      ok(this.with({ gatewayTransactionId: charge.gatewayTransactionId, card: charge.card })),
    );
  }

  finalize(outcome: FinalOutcome, at: Date): Result<Transaction, InvalidStateTransition> {
    return andThen(this.ensurePending(outcome.status), () =>
      ok(
        this.with({
          status: outcome.status,
          statusMessage: outcome.statusMessage?.slice(0, MAX_STATUS_MESSAGE_LENGTH) ?? null,
          card: outcome.card ?? this.props.card,
          finalizedAt: at,
        }),
      ),
    );
  }

  private ensurePending(to: TransactionStatus): Result<this, InvalidStateTransition> {
    return this.isFinal
      ? err({ code: 'INVALID_STATE_TRANSITION', from: this.props.status, to })
      : ok(this);
  }

  private with(changes: Partial<TransactionProps>): Transaction {
    return new Transaction({ ...this.props, ...changes });
  }
}
