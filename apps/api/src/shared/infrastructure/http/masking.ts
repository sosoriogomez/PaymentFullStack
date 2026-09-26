/** Customer data never leaves the API complete (OWASP API1/API3): `a***@mail.com`, `***4567`. */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
};

export const VISIBLE_PHONE_DIGITS = 4;

export const maskPhone = (phone: string): string =>
  phone.length <= VISIBLE_PHONE_DIGITS ? '***' : `***${phone.slice(-VISIBLE_PHONE_DIGITS)}`;
