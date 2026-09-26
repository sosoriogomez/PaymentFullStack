import { AsyncResult } from '../../../shared/kernel/async-result';
import { type DomainError } from '../../../shared/kernel/domain-error';
import { type Clock, type Hasher, type IdGenerator } from '../../../shared/kernel/ports';
import { combineObject, err, map, ok, type Result } from '../../../shared/kernel/result';
import { type FeePolicy } from '../../checkout/domain/fee-policy.port';
import { type OrderAmounts, priceOrder } from '../../checkout/domain/order-amounts';
import { Quantity } from '../../checkout/domain/quantity';
import { type Customer } from '../../customers/domain/customer';
import { type CustomerRepository } from '../../customers/domain/customer.repository.port';
import {
  type CardChargeRequest,
  type GatewayError,
  type GatewayTransaction,
  type PaymentGateway,
} from '../../payment-gateway/domain/payment-gateway.port';
import { type Product } from '../../products/domain/product';
import { type ProductRepository } from '../../products/domain/product.repository.port';
import { Installments } from '../domain/installments';
import { purchaseFingerprint } from '../domain/purchase-intent';
import { type ReferenceGenerator } from '../domain/reference-generator.port';
import { ShippingAddress, type ShippingAddressInput } from '../domain/shipping-address';
import { type InvalidStateTransition, Transaction } from '../domain/transaction';
import { type TransactionRepository } from '../domain/transaction.repository.port';
import { type TransactionView, type TransactionViews } from './transaction-views';

/** One-time credentials: they only travel to the gateway, never to the database or the logs. */
export interface PaymentCredentials {
  readonly cardToken: string;
  readonly installments: number;
  readonly acceptanceToken: string;
  readonly acceptPersonalAuth: string;
}

export interface CreateTransactionCommand {
  readonly idempotencyKey: string;
  readonly productId: string;
  readonly quantity: number;
  readonly customerId: string;
  readonly delivery: ShippingAddressInput;
  readonly payment: PaymentCredentials;
}

export interface CreateTransactionOutcome {
  /** `replayed`: the Idempotency-Key was already used for the same purchase. */
  readonly kind: 'created' | 'replayed';
  readonly view: TransactionView;
}

export interface CreateTransactionDeps {
  readonly transactions: TransactionRepository;
  readonly products: ProductRepository;
  readonly customers: CustomerRepository;
  readonly gateway: PaymentGateway;
  readonly fees: FeePolicy;
  readonly references: ReferenceGenerator;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly hasher: Hasher;
  readonly views: TransactionViews;
}

interface ValidInput {
  readonly quantity: Quantity;
  readonly installments: Installments;
  readonly shipping: ShippingAddress;
  readonly requestHash: string;
}

interface Order extends ValidInput {
  readonly product: Product;
  readonly customer: Customer;
  readonly amounts: OrderAmounts;
}

interface Settled {
  readonly kind: CreateTransactionOutcome['kind'];
  readonly transaction: Transaction;
}

const chargeRequestOf = (
  transaction: Transaction,
  customer: Customer,
  payment: PaymentCredentials,
): CardChargeRequest => ({
  reference: transaction.reference,
  amountInCents: transaction.amounts.total.amountInCents,
  currency: transaction.amounts.total.currency,
  customerEmail: customer.email,
  customer: { fullName: customer.fullName, phone: customer.phone },
  cardToken: payment.cardToken,
  installments: transaction.installments,
  acceptanceToken: payment.acceptanceToken,
  acceptPersonalAuth: payment.acceptPersonalAuth,
  shipping: transaction.shipping,
});

/**
 * Creates the PENDING transaction and charges it once (spec §5.2):
 * validate → idempotency (replay or conflict) → product, stock, price, customer → commit
 * PENDING → charge → record the gateway answer.
 */
export class CreateTransaction {
  constructor(private readonly deps: CreateTransactionDeps) {}

  async execute(
    command: CreateTransactionCommand,
  ): Promise<Result<CreateTransactionOutcome, DomainError>> {
    return await AsyncResult.from(this.validate(command))
      .andThen(async (input) => {
        const existing = await this.deps.transactions.findByIdempotencyKey(command.idempotencyKey);
        return existing
          ? this.replay(existing, input.requestHash)
          : this.createAndCharge(command, input);
      })
      .map(async ({ kind, transaction }) => ({
        kind,
        view: await this.deps.views.of(transaction),
      }));
  }

  private validate(command: CreateTransactionCommand): Result<ValidInput, DomainError> {
    const parsed = combineObject({
      quantity: Quantity.of(command.quantity),
      installments: Installments.of(command.payment.installments),
      shipping: ShippingAddress.parse(command.delivery),
    });
    return map(parsed, (input) => ({
      ...input,
      requestHash: purchaseFingerprint(
        {
          productId: command.productId,
          quantity: input.quantity.value,
          customerId: command.customerId,
          installments: input.installments.value,
          delivery: input.shipping.snapshot,
        },
        this.deps.hasher,
      ),
    }));
  }

  private replay(existing: Transaction, requestHash: string): Result<Settled, DomainError> {
    return existing.isSameRequest(requestHash)
      ? ok({ kind: 'replayed', transaction: existing })
      : err({ code: 'IDEMPOTENCY_CONFLICT', idempotencyKey: existing.idempotencyKey });
  }

  private async createAndCharge(
    command: CreateTransactionCommand,
    input: ValidInput,
  ): Promise<Result<Settled, DomainError>> {
    return await AsyncResult.from(this.loadOrder(command, input)).andThen((order) =>
      this.openAndCharge(command, order),
    );
  }

  private loadOrder(command: CreateTransactionCommand, input: ValidInput) {
    return AsyncResult.from(this.loadProduct(command.productId))
      .andThen((product) => map(product.ensureStockFor(input.quantity.value), () => product))
      .andThen((product) =>
        map(priceOrder({ product, quantity: input.quantity }, this.deps.fees), (amounts) => ({
          ...input,
          product,
          amounts,
        })),
      )
      .andThen((order) => this.withCustomer(command.customerId, order));
  }

  private async loadProduct(productId: string): Promise<Result<Product, DomainError>> {
    const product = await this.deps.products.findById(productId);
    return product ? ok(product) : err({ code: 'PRODUCT_NOT_FOUND', productId });
  }

  private async withCustomer(
    customerId: string,
    order: Omit<Order, 'customer'>,
  ): Promise<Result<Order, DomainError>> {
    const customer = await this.deps.customers.findById(customerId);
    return customer ? ok({ ...order, customer }) : err({ code: 'CUSTOMER_NOT_FOUND', customerId });
  }

  private async openAndCharge(
    command: CreateTransactionCommand,
    order: Order,
  ): Promise<Result<Settled, DomainError>> {
    return await AsyncResult.from(this.newPending(command, order)).andThen(async (pending) =>
      (await this.deps.transactions.insertPending(pending)) === 'inserted'
        ? this.charge(pending, order.customer, command.payment)
        : // A concurrent request with the same key won the race: answer as its replay.
          this.replayWinner(command.idempotencyKey, order.requestHash),
    );
  }

  private newPending(command: CreateTransactionCommand, order: Order) {
    return Transaction.createPending({
      id: this.deps.ids.uuid(),
      reference: this.deps.references.next(),
      productId: order.product.id,
      customerId: order.customer.id,
      quantity: order.quantity,
      amounts: order.amounts,
      installments: order.installments,
      shipping: order.shipping,
      idempotencyKey: command.idempotencyKey,
      requestHash: order.requestHash,
      createdAt: this.deps.clock.now(),
    });
  }

  private async replayWinner(
    idempotencyKey: string,
    requestHash: string,
  ): Promise<Result<Settled, DomainError>> {
    const winner = await this.deps.transactions.findByIdempotencyKey(idempotencyKey);
    if (!winner) throw new Error(`Idempotency key ${idempotencyKey} is taken but not found`);
    return this.replay(winner, requestHash);
  }

  private async charge(
    pending: Transaction,
    customer: Customer,
    payment: PaymentCredentials,
  ): Promise<Result<Settled, DomainError>> {
    const charged = await this.deps.gateway.createCardTransaction(
      chargeRequestOf(pending, customer, payment),
    );
    return await AsyncResult.from(this.applyCharge(pending, charged)).map(async (next) => ({
      kind: 'created' as const,
      transaction: await this.persist(pending, next),
    }));
  }

  /**
   * Rejected → ERROR: the resource exists, the payment failed. Unavailable (timeout, 5xx) → the
   * outcome is unknown, not a failure: it stays PENDING without a gateway id and the sync or the
   * reconciliation resolve it by reference. A charge is never retried automatically.
   */
  private applyCharge(
    pending: Transaction,
    charged: Result<GatewayTransaction, GatewayError>,
  ): Result<Transaction, InvalidStateTransition> {
    if (charged.ok) {
      const { id, card } = charged.value;
      return pending.recordCharge({ gatewayTransactionId: id, card });
    }
    if (charged.error.code === 'GATEWAY_REJECTED') {
      const outcome = { status: 'ERROR', statusMessage: charged.error.reason } as const;
      return pending.finalize(outcome, this.deps.clock.now());
    }
    return ok(pending);
  }

  /** When the optimistic guard fails, someone else already finalized it: that state wins. */
  private async persist(pending: Transaction, next: Transaction): Promise<Transaction> {
    if (next === pending || (await this.deps.transactions.updateIfPending(next))) return next;
    return (await this.deps.transactions.findById(next.id)) ?? next;
  }
}
