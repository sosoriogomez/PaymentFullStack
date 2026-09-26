import { ColombianPhone, Email, PersonName } from '../../src/modules/customers/domain/contact';
import { Customer } from '../../src/modules/customers/domain/customer';
import {
  type CustomerRepository,
  type UpsertedCustomer,
} from '../../src/modules/customers/domain/customer.repository.port';
import { type Result } from '../../src/shared/kernel/result';

const valid = <T>(result: Result<T, unknown>): T => {
  if (!result.ok) throw new Error('invalid customer data in fake repository');
  return result.value;
};

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly byId = new Map<string, Customer>();

  constructor(customers: readonly Customer[] = []) {
    customers.forEach((customer) => this.byId.set(customer.id, customer));
  }

  upsertByEmail(customer: Customer): Promise<UpsertedCustomer> {
    const existing = [...this.byId.values()].find((stored) => stored.email === customer.email);
    const stored = existing
      ? Customer.create({
          id: existing.id,
          fullName: valid(PersonName.parse(customer.fullName)),
          email: valid(Email.parse(customer.email)),
          phone: valid(ColombianPhone.parse(customer.phone)),
        })
      : customer;
    this.byId.set(stored.id, stored);
    return Promise.resolve({ customer: stored, created: !existing });
  }

  findById(id: string): Promise<Customer | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
}
