import { type DomainError, validationError } from '../../../shared/kernel/domain-error';
import { combineObject, err, map, ok, type Result } from '../../../shared/kernel/result';
import { ColombianPhone, PersonName } from '../../customers/domain/contact';

/** The gateway operates in Colombia (M-07): the only country accepted for delivery. */
export const DELIVERY_COUNTRIES = ['CO'] as const;
const POSTAL_CODE = /^\d{6}$/;

export interface ShippingAddressInput {
  readonly recipientName: string;
  readonly recipientPhone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string | undefined;
  readonly city: string;
  readonly region: string;
  readonly country: string;
  readonly postalCode?: string | undefined;
}

/** Normalized address as persisted with the transaction (its shipping snapshot). */
export type ShippingSnapshot = ShippingAddressInput;

const fieldOf = (name: keyof ShippingAddressInput): string => `delivery.${name}`;

const text = (
  name: keyof ShippingAddressInput,
  raw: string,
  length: { readonly min: number; readonly max: number },
): Result<string, DomainError> => {
  const value = raw.trim().replace(/\s+/g, ' ');
  return value.length >= length.min && value.length <= length.max
    ? ok(value)
    : err(validationError(fieldOf(name), `must have ${length.min} to ${length.max} characters`));
};

const optionalText = (
  name: keyof ShippingAddressInput,
  raw: string | undefined,
  max: number,
): Result<string | undefined, DomainError> =>
  raw === undefined || raw.trim() === '' ? ok(undefined) : text(name, raw, { min: 1, max });

const country = (raw: string): Result<string, DomainError> =>
  (DELIVERY_COUNTRIES as readonly string[]).includes(raw)
    ? ok(raw)
    : err(validationError(fieldOf('country'), `must be one of ${DELIVERY_COUNTRIES.join(', ')}`));

const postalCode = (raw: string | undefined): Result<string | undefined, DomainError> =>
  raw === undefined || POSTAL_CODE.test(raw)
    ? ok(raw)
    : err(validationError(fieldOf('postalCode'), 'must have 6 digits'));

/** Where the order goes. The recipient may be someone other than the paying customer. */
export class ShippingAddress {
  private constructor(readonly snapshot: ShippingSnapshot) {}

  static parse(input: ShippingAddressInput): Result<ShippingAddress, DomainError> {
    const fields = combineObject({
      recipientName: map(
        PersonName.parse(input.recipientName, fieldOf('recipientName')),
        (name) => name.value,
      ),
      recipientPhone: map(
        ColombianPhone.parse(input.recipientPhone, fieldOf('recipientPhone')),
        (phone) => phone.value,
      ),
      addressLine1: text('addressLine1', input.addressLine1, { min: 3, max: 120 }),
      addressLine2: optionalText('addressLine2', input.addressLine2, 120),
      city: text('city', input.city, { min: 2, max: 80 }),
      region: text('region', input.region, { min: 2, max: 80 }),
      country: country(input.country),
      postalCode: postalCode(input.postalCode),
    });
    return map(fields, (snapshot) => new ShippingAddress(snapshot));
  }
}
