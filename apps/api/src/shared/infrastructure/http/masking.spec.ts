import { maskEmail, maskPhone } from './masking';

describe('masking', () => {
  it.each([
    ['ana@mail.com', 'a***@mail.com'],
    ['j@x.co', 'j***@x.co'],
    ['first.last+tag@sub.domain.com', 'f***@sub.domain.com'],
    ['not-an-email', '***'],
    ['@nolocal.com', '***'],
  ])('should mask the email %p as %p', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it.each([
    ['3001234567', '***4567'],
    ['1234', '***'],
    ['', '***'],
  ])('should mask the phone %p as %p', (phone, masked) => {
    expect(maskPhone(phone)).toBe(masked);
  });
});
