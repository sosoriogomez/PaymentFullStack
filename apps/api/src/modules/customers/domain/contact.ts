import { type DomainError, validationError } from '../../../shared/kernel/domain-error';
import { err, ok, type Result } from '../../../shared/kernel/result';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;
const COLOMBIAN_MOBILE = /^3\d{9}$/;
/** Letters (with accents), spaces and the punctuation real names use. */
const PERSON_NAME = /^\p{L}[\p{L} .'-]*$/u;
const NAME_LENGTH = { min: 3, max: 80 } as const;

/** Email normalized to lower case and without surrounding spaces. */
export class Email {
  private constructor(readonly value: string) {}

  static parse(raw: string): Result<Email, DomainError> {
    const value = raw.trim().toLowerCase();
    return value.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(value)
      ? ok(new Email(value))
      : err(validationError('email', 'must be a valid email address'));
  }
}

/** Colombian mobile number: 10 digits starting with 3. */
export class ColombianPhone {
  private constructor(readonly value: string) {}

  static parse(raw: string, field = 'phone'): Result<ColombianPhone, DomainError> {
    const value = raw.trim();
    return COLOMBIAN_MOBILE.test(value)
      ? ok(new ColombianPhone(value))
      : err(
          validationError(field, 'must be a Colombian mobile number (10 digits starting with 3)'),
        );
  }
}

export class PersonName {
  private constructor(readonly value: string) {}

  static parse(raw: string, field = 'fullName'): Result<PersonName, DomainError> {
    const value = raw.trim().replace(/\s+/g, ' ');
    const validLength = value.length >= NAME_LENGTH.min && value.length <= NAME_LENGTH.max;
    return validLength && PERSON_NAME.test(value)
      ? ok(new PersonName(value))
      : err(validationError(field, `must have ${NAME_LENGTH.min} to ${NAME_LENGTH.max} letters`));
  }
}
