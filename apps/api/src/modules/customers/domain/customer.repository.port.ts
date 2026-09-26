import { type TransactionContext } from '../../../shared/kernel/unit-of-work';
import { type Customer } from './customer';

export interface UpsertedCustomer {
  readonly customer: Customer;
  /** False when a customer with the same email (case-insensitive) already existed. */
  readonly created: boolean;
}

export interface CustomerRepository {
  /** Inserts, or updates name and phone of the customer with the same email (keeping its id). */
  upsertByEmail(customer: Customer): Promise<UpsertedCustomer>;
  findById(id: string, tx?: TransactionContext): Promise<Customer | null>;
}

export const CUSTOMER_REPOSITORY = Symbol('CustomerRepository');
