import { type DomainError } from '../../../shared/kernel/domain-error';
import { err, ok, type Result } from '../../../shared/kernel/result';
import { type Customer } from '../domain/customer';
import { type CustomerRepository } from '../domain/customer.repository.port';

export type CustomerNotFound = Extract<DomainError, { code: 'CUSTOMER_NOT_FOUND' }>;

export class GetCustomer {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(customerId: string): Promise<Result<Customer, CustomerNotFound>> {
    const customer = await this.customers.findById(customerId);
    return customer ? ok(customer) : err({ code: 'CUSTOMER_NOT_FOUND', customerId });
  }
}
