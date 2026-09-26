import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CLOCK,
  type Clock,
  HASHER,
  type Hasher,
  ID_GENERATOR,
  type IdGenerator,
} from '../../shared/kernel/ports';
import { CheckoutModule } from '../checkout/checkout.module';
import { FEE_POLICY, type FeePolicy } from '../checkout/domain/fee-policy.port';
import { CustomersModule } from '../customers/customers.module';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../customers/domain/customer.repository.port';
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
import { FindTransactionByIdempotencyKey } from './application/find-transaction-by-idempotency-key.use-case';
import { TransactionViews } from './application/transaction-views';
import { REFERENCE_GENERATOR, type ReferenceGenerator } from './domain/reference-generator.port';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from './domain/transaction.repository.port';
import { TransactionsController } from './infrastructure/http/transactions.controller';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';
import { UlidReferenceGenerator } from './infrastructure/references/ulid-reference-generator';

@Module({
  imports: [ProductsModule, CustomersModule, CheckoutModule, PaymentGatewayModule],
  controllers: [TransactionsController],
  providers: [
    {
      provide: TRANSACTION_REPOSITORY,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmTransactionRepository(ds),
    },
    { provide: REFERENCE_GENERATOR, useFactory: () => new UlidReferenceGenerator() },
    {
      provide: TransactionViews,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (products: ProductRepository) => new TransactionViews(products),
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
  ],
  exports: [TRANSACTION_REPOSITORY, TransactionViews],
})
export class TransactionsModule {}
