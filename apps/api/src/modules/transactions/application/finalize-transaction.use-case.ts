import { AsyncResult } from '../../../shared/kernel/async-result';
import { type DomainError } from '../../../shared/kernel/domain-error';
import { type AlertLog, type Clock, type IdGenerator } from '../../../shared/kernel/ports';
import { andThen, err, ok, type Result } from '../../../shared/kernel/result';
import { type TransactionContext, type UnitOfWork } from '../../../shared/kernel/unit-of-work';
import { Delivery } from '../../deliveries/domain/delivery';
import { type DeliveryRepository } from '../../deliveries/domain/delivery.repository.port';
import { type FinalGatewayTransaction } from '../../payment-gateway/domain/payment-gateway.port';
import { type ProductRepository } from '../../products/domain/product.repository.port';
import { AMOUNT_MISMATCH, type FinalOutcome, type Transaction } from '../domain/transaction';
import { type TransactionRepository } from '../domain/transaction.repository.port';

export interface FinalizeTransactionCommand {
  readonly transactionId: string;
  /** What the gateway reports (sync, webhook or reconciliation): always a final status. */
  readonly record: FinalGatewayTransaction;
}

export interface Finalized {
  readonly transaction: Transaction;
  /** False when it was already final: another path (polling, webhook, reconciliation) won. */
  readonly changed: boolean;
}

export interface FinalizeTransactionDeps {
  readonly unitOfWork: UnitOfWork;
  readonly transactions: TransactionRepository;
  readonly products: ProductRepository;
  readonly deliveries: DeliveryRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly alerts: AlertLog;
}

/**
 * The only way a transaction reaches a final status (spec §4.3). In one database transaction:
 * optimistic `UPDATE … WHERE status = 'PENDING'`; when APPROVED, atomic stock decrement and a
 * delivery (ASSIGNED, or BACKORDERED if a concurrent purchase took the last units). Idempotent:
 * running it twice, or from two paths at once, changes the stock and creates a delivery once.
 */
export class FinalizeTransaction {
  constructor(private readonly deps: FinalizeTransactionDeps) {}

  execute(command: FinalizeTransactionCommand): Promise<Result<Finalized, DomainError>> {
    return this.deps.unitOfWork.run((tx) => this.finalizeWithin(tx, command));
  }

  private async finalizeWithin(
    tx: TransactionContext,
    { transactionId, record }: FinalizeTransactionCommand,
  ): Promise<Result<Finalized, DomainError>> {
    const current = await this.deps.transactions.findById(transactionId, tx);
    if (!current) return err({ code: 'TRANSACTION_NOT_FOUND', by: 'id', value: transactionId });
    if (current.isFinal) return ok({ transaction: current, changed: false });
    return await AsyncResult.from(this.settle(current, record)).andThen((final) =>
      this.persist(tx, final),
    );
  }

  private settle(
    current: Transaction,
    record: FinalGatewayTransaction,
  ): Result<Transaction, DomainError> {
    if (!current.matchesCharge(record)) return this.rejectMismatch(current, record);
    const outcome: FinalOutcome = {
      status: record.status,
      statusMessage: record.statusMessage,
      card: record.card,
    };
    const charged = current.gatewayTransactionId
      ? ok(current)
      : current.recordCharge({ gatewayTransactionId: record.id, card: record.card });
    return andThen(charged, (transaction) => transaction.finalize(outcome, this.deps.clock.now()));
  }

  /** I-06: never deliver nor touch the stock for a charge that is not exactly ours. */
  private rejectMismatch(
    current: Transaction,
    record: FinalGatewayTransaction,
  ): Result<Transaction, DomainError> {
    this.deps.alerts.error(AMOUNT_MISMATCH, {
      transactionId: current.id,
      reference: current.reference,
      expectedAmountInCents: current.amounts.total.amountInCents,
      expectedCurrency: current.amounts.total.currency,
      gatewayReference: record.reference,
      gatewayAmountInCents: record.amountInCents,
      gatewayCurrency: record.currency,
      gatewayStatus: record.status,
    });
    return current.finalize(
      { status: 'ERROR', statusMessage: AMOUNT_MISMATCH },
      this.deps.clock.now(),
    );
  }

  private async persist(
    tx: TransactionContext,
    final: Transaction,
  ): Promise<Result<Finalized, DomainError>> {
    if (!(await this.deps.transactions.updateIfPending(final, tx))) {
      const winner = await this.deps.transactions.findById(final.id, tx);
      return ok({ transaction: winner ?? final, changed: false });
    }
    if (final.status === 'APPROVED') await this.deliver(tx, final);
    return ok({ transaction: final, changed: true });
  }

  private async deliver(tx: TransactionContext, approved: Transaction): Promise<void> {
    const inStock = await this.deps.products.decrementStockIfAvailable(
      approved.productId,
      approved.quantity,
      tx,
    );
    const delivery = {
      id: this.deps.ids.uuid(),
      transactionId: approved.id,
      customerId: approved.customerId,
      productId: approved.productId,
      quantity: approved.quantity,
      address: approved.shipping,
      createdAt: this.deps.clock.now(),
    };
    if (!inStock) {
      this.deps.alerts.warn('BACKORDERED', {
        transactionId: approved.id,
        productId: approved.productId,
        quantity: approved.quantity,
      });
    }
    await this.deps.deliveries.save(
      inStock ? Delivery.assign(delivery) : Delivery.backorder(delivery),
      tx,
    );
  }
}
