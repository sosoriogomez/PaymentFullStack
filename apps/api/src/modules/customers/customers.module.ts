import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ID_GENERATOR, type IdGenerator } from '../../shared/kernel/ports';
import { GetCustomer } from './application/get-customer.use-case';
import { RegisterCustomer } from './application/register-customer.use-case';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from './domain/customer.repository.port';
import { CustomersController } from './infrastructure/http/customers.controller';
import { TypeOrmCustomerRepository } from './infrastructure/persistence/typeorm-customer.repository';

@Module({
  controllers: [CustomersController],
  providers: [
    {
      provide: CUSTOMER_REPOSITORY,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmCustomerRepository(ds),
    },
    {
      provide: RegisterCustomer,
      inject: [CUSTOMER_REPOSITORY, ID_GENERATOR],
      useFactory: (customers: CustomerRepository, ids: IdGenerator) =>
        new RegisterCustomer(customers, ids),
    },
    {
      provide: GetCustomer,
      inject: [CUSTOMER_REPOSITORY],
      useFactory: (customers: CustomerRepository) => new GetCustomer(customers),
    },
  ],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
