import { trusted } from '../../../../shared/infrastructure/database/trusted';
import { ColombianPhone, Email, PersonName } from '../../domain/contact';
import { Customer } from '../../domain/customer';

export interface CustomerRow {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly phone: string;
}

export const toCustomer = (row: CustomerRow): Customer =>
  Customer.create({
    id: row.id,
    fullName: trusted(PersonName.parse(row.fullName), `name of customer ${row.id}`),
    email: trusted(Email.parse(row.email), `email of customer ${row.id}`),
    phone: trusted(ColombianPhone.parse(row.phone), `phone of customer ${row.id}`),
  });
