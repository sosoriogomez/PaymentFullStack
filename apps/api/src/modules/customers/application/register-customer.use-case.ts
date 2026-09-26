import { AsyncResult } from '../../../shared/kernel/async-result';
import { type DomainError } from '../../../shared/kernel/domain-error';
import { type IdGenerator } from '../../../shared/kernel/ports';
import { andThen, map, type Result } from '../../../shared/kernel/result';
import { ColombianPhone, Email, PersonName } from '../domain/contact';
import { Customer } from '../domain/customer';
import { type CustomerRepository, type UpsertedCustomer } from '../domain/customer.repository.port';

export interface RegisterCustomerCommand {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
}

export class RegisterCustomer {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: RegisterCustomerCommand): Promise<Result<UpsertedCustomer, DomainError>> {
    return await AsyncResult.from(this.toCustomer(command)).map((customer) =>
      this.customers.upsertByEmail(customer),
    );
  }

  private toCustomer(command: RegisterCustomerCommand): Result<Customer, DomainError> {
    return andThen(PersonName.parse(command.fullName), (fullName) =>
      andThen(Email.parse(command.email), (email) =>
        map(ColombianPhone.parse(command.phone), (phone) =>
          Customer.create({ id: this.ids.uuid(), fullName, email, phone }),
        ),
      ),
    );
  }
}
