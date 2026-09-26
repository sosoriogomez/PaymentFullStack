import { maskEmail, maskPhone } from '../../../../shared/infrastructure/http/masking';
import { type Customer } from '../../domain/customer';

/** Always masked: an id is enough to read this resource, so it never reveals full contact data. */
export class CustomerResponse {
  readonly id!: string;
  readonly fullName!: string;
  readonly email!: string;
  readonly phone!: string;

  static from(customer: Customer): CustomerResponse {
    return {
      id: customer.id,
      fullName: customer.fullName,
      email: maskEmail(customer.email),
      phone: maskPhone(customer.phone),
    };
  }
}
