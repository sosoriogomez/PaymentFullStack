import { ColombianPhone, Email, PersonName } from '../../src/modules/customers/domain/contact';
import { Customer } from '../../src/modules/customers/domain/customer';
import { type Result } from '../../src/shared/kernel/result';

export const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

const valid = <T>(result: Result<T, unknown>): T => {
  if (!result.ok) throw new Error('invalid value in test builder');
  return result.value;
};

export const aCustomer = (
  overrides: { id?: string; fullName?: string; email?: string; phone?: string } = {},
): Customer =>
  Customer.create({
    id: overrides.id ?? CUSTOMER_ID,
    fullName: valid(PersonName.parse(overrides.fullName ?? 'Ana Pérez')),
    email: valid(Email.parse(overrides.email ?? 'ana@mail.com')),
    phone: valid(ColombianPhone.parse(overrides.phone ?? '3001234567')),
  });
