import { aPaymentForm } from '@test/builders';
import { es } from '@/shared/i18n/es';
import { createPaymentFormSchema, deliverySchema, initialPaymentForm } from './payment-form-schema';

const NOW = new Date(2026, 9, 15).getTime();
const messages = es.checkout.delivery.errors;
const valid = aPaymentForm();

describe('deliverySchema', () => {
  it('should accept a complete Colombian delivery and trim it', () => {
    const result = deliverySchema.safeParse({ ...valid, fullName: '  Ana Pérez ', postalCode: '' });

    expect(result.success && result.data.fullName).toBe('Ana Pérez');
  });

  it.each([
    [{ fullName: 'An' }, messages.fullName],
    [{ fullName: 'Ana 2' }, messages.fullName],
    [{ email: 'ana@' }, messages.email],
    [{ phone: '6041234567' }, messages.phone],
    [{ phone: '300123456' }, messages.phone],
    [{ addressLine1: 'Cr' }, messages.addressLine1],
    [{ addressLine2: 'x'.repeat(121) }, messages.addressLine2],
    [{ region: 'Texas' }, messages.region],
    [{ region: '' }, messages.region],
    [{ city: 'M' }, messages.city],
    [{ postalCode: '0500' }, messages.postalCode],
  ])('should reject %p', (override, message) => {
    const result = deliverySchema.safeParse({ ...valid, ...override });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe('createPaymentFormSchema', () => {
  const schema = createPaymentFormSchema(() => NOW);

  it('should accept the whole valid form', () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each([
    [{ acceptTerms: false }, es.checkout.terms.errors.accept],
    [{ acceptPersonalData: false }, es.checkout.terms.errors.personalData],
  ])('should require the explicit acceptance of %p', (override, message) => {
    const result = schema.safeParse({ ...valid, ...override });

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([message]);
  });

  it('should start with empty card fields, the saved drafts and nothing accepted', () => {
    const initial = initialPaymentForm({ ...valid, city: 'Medellín' });

    expect(initial).toMatchObject({
      number: '',
      cvc: '',
      city: 'Medellín',
      acceptTerms: false,
      acceptPersonalData: false,
    });
  });
});
