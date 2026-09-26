import { Module } from '@nestjs/common';
import { AppConfigService } from '../../shared/infrastructure/config/app-config.service';
import { DataSource } from 'typeorm';
import {
  ALERT_LOG,
  type AlertLog,
  CLOCK,
  type Clock,
  HASHER,
  type Hasher,
  ID_GENERATOR,
  type IdGenerator,
} from '../../shared/kernel/ports';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/kernel/unit-of-work';
import { CheckoutModule } from '../checkout/checkout.module';
import { FEE_POLICY, type FeePolicy } from '../checkout/domain/fee-policy.port';
import { CustomersModule } from '../customers/customers.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import {
  DELIVERY_REPOSITORY,
  type DeliveryRepository,
} from '../deliveries/domain/delivery.repository.port';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../customers/domain/customer.repository.port';
import {
  PAYMENT_EVENT_VERIFIER,
  type PaymentEventVerifier,
} from '../payment-gateway/domain/payment-event.port';
import {
  PAYMENT_GATEWAY,
  type PaymentGateway,
} from '../payment-gateway/domain/payment-gateway.port';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../products/domain/product.repository.port';
import { ProductsModule } from '../products/products.module';
import { CreateTransaction } from './application/create-transaction.use-case';
import { FinalizeTransaction } from './application/finalize-transaction.use-case';
import { FindTransactionByIdempotencyKey } from './application/find-transaction-by-idempotency-key.use-case';
import { GetTransaction } from './application/get-transaction.use-case';
import { HandlePaymentEvent } from './application/handle-payment-event.use-case';
import { ReconcilePendingTransactions } from './application/reconcile-pending-transactions.use-case';
import { SyncTransactionStatus } from './application/sync-transaction-status.use-case';
import { TransactionViews } from './application/transaction-views';
import { REFERENCE_GENERATOR, type ReferenceGenerator } from './domain/reference-generator.port';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from './domain/transaction.repository.port';
import { PaymentEventsController } from './infrastructure/http/payment-events.controller';
import { TransactionsController } from './infrastructure/http/transactions.controller';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';
import { UlidReferenceGenerator } from './infrastructure/references/ulid-reference-generator';

@Module({
  imports: [
    ProductsModule,
    CustomersModule,
    CheckoutModule,
    PaymentGatewayModule,
    DeliveriesModule,
  ],
  controllers: [TransactionsController, PaymentEventsController],
  providers: [
    {
      provide: TRANSACTION_REPOSITORY,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmTransactionRepository(ds),
    },
    { provide: REFERENCE_GENERATOR, useFactory: () => new UlidReferenceGenerator() },
    {
      provide: TransactionViews,
      inject: [PRODUCT_REPOSITORY, DELIVERY_REPOSITORY],
      useFactory: (products: ProductRepository, deliveries: DeliveryRepository) =>
        new TransactionViews(products, deliveries),
    },
    {
      provide: CreateTransaction,
      inject: [
        TRANSACTION_REPOSITORY,
        PRODUCT_REPOSITORY,
        CUSTOMER_REPOSITORY,
        PAYMENT_GATEWAY,
        FEE_POLICY,
        REFERENCE_GENERATOR,
        ID_GENERATOR,
        CLOCK,
        HASHER,
        TransactionViews,
      ],
      useFactory: (
        transactions: TransactionRepository,
        products: ProductRepository,
        customers: CustomerRepository,
        gateway: PaymentGateway,
        fees: FeePolicy,
        references: ReferenceGenerator,
        ids: IdGenerator,
        clock: Clock,
        hasher: Hasher,
        views: TransactionViews,
      ) =>
        new CreateTransaction({
          transactions,
          products,
          customers,
          gateway,
          fees,
          references,
          ids,
          clock,
          hasher,
          views,
        }),
    },
    {
      provide: FindTransactionByIdempotencyKey,
      inject: [TRANSACTION_REPOSITORY, TransactionViews],
      useFactory: (transactions: TransactionRepository, views: TransactionViews) =>
        new FindTransactionByIdempotencyKey(transactions, views),
    },
    {
      provide: FinalizeTransaction,
      inject: [
        UNIT_OF_WORK,
        TRANSACTION_REPOSITORY,
        PRODUCT_REPOSITORY,
        DELIVERY_REPOSITORY,
        ID_GENERATOR,
        CLOCK,
        ALERT_LOG,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        transactions: TransactionRepository,
        products: ProductRepository,
        deliveries: DeliveryRepository,
        ids: IdGenerator,
        clock: Clock,
        alerts: AlertLog,
      ) =>
        new FinalizeTransaction({
          unitOfWork,
          transactions,
          products,
          deliveries,
          ids,
          clock,
          alerts,
        }),
    },
    {
      provide: SyncTransactionStatus,
      inject: [TRANSACTION_REPOSITORY, PAYMENT_GATEWAY, FinalizeTransaction],
      useFactory: (
        transactions: TransactionRepository,
        gateway: PaymentGateway,
        finalize: FinalizeTransaction,
      ) => new SyncTransactionStatus(transactions, gateway, finalize),
    },
    {
      provide: GetTransaction,
      inject: [SyncTransactionStatus, TransactionViews],
      useFactory: (sync: SyncTransactionStatus, views: TransactionViews) =>
        new GetTransaction(sync, views),
    },
    {
      provide: HandlePaymentEvent,
      inject: [PAYMENT_EVENT_VERIFIER, TRANSACTION_REPOSITORY, FinalizeTransaction],
      useFactory: (
        verifier: PaymentEventVerifier,
        transactions: TransactionRepository,
        finalize: FinalizeTransaction,
      ) => new HandlePaymentEvent(verifier, transactions, finalize),
    },
    {
      provide: ReconcilePendingTransactions,
      inject: [TRANSACTION_REPOSITORY, SyncTransactionStatus, CLOCK, ALERT_LOG, AppConfigService],
      useFactory: (
        transactions: TransactionRepository,
        sync: SyncTransactionStatus,
        clock: Clock,
        alerts: AlertLog,
        config: AppConfigService,
      ) =>
        new ReconcilePendingTransactions(transactions, sync, clock, alerts, config.reconciliation),
    },
  ],
  exports: [TRANSACTION_REPOSITORY, FinalizeTransaction, SyncTransactionStatus],
})
export class TransactionsModule {}
