import { err } from '../../../shared/kernel/result';
import { ColombianPhone, Email, PersonName } from './contact';

describe('Email', () => {
  it.each([
    ['ana@mail.com', 'ana@mail.com'],
    ['  Ana.Perez@Mail.COM ', 'ana.perez@mail.com'],
  ])('should normalize %p to %p', (raw, value) => {
    const email = Email.parse(raw);

    expect(email.ok && email.value.value).toBe(value);
  });

  it.each([
    'ana',
    'ana@',
    '@mail.com',
    'ana@mail',
    'ana perez@mail.com',
    `${'a'.repeat(250)}@mail.com`,
  ])('should reject %p', (raw) => {
    expect(Email.parse(raw)).toEqual(
      err({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'email', message: 'must be a valid email address' }],
      }),
    );
  });
});

describe('ColombianPhone', () => {
  it('should accept Colombian mobile numbers', () => {
    const phone = ColombianPhone.parse(' 3001234567 ');

    expect(phone.ok && phone.value.value).toBe('3001234567');
  });

  it.each(['300123456', '30012345678', '6011234567', '+573001234567', '300-123-4567'])(
    'should reject %p',
    (raw) => {
      expect(ColombianPhone.parse(raw).ok).toBe(false);
    },
  );
});

describe('PersonName', () => {
  it.each([
    ['Ana Pérez', 'Ana Pérez'],
    ['  María   José  Núñez ', 'María José Núñez'],
    ["D'Angelo O'Neil-Smith Jr.", "D'Angelo O'Neil-Smith Jr."],
  ])('should accept and tidy %p', (raw, value) => {
    const name = PersonName.parse(raw);

    expect(name.ok && name.value.value).toBe(value);
  });

  it.each(['Al', 'A'.repeat(81), '1234', 'Ana <script>', ' -Ana'])('should reject %p', (raw) => {
    expect(PersonName.parse(raw, 'recipientName')).toEqual(
      err({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'recipientName', message: 'must have 3 to 80 letters' }],
      }),
    );
  });
});
