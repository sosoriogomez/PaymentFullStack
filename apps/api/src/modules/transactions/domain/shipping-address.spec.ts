import { DELIVERY } from '../../../../test/builders/transaction.builder';
import { hasher } from '../../../../test/fakes/kernel';
import { Installments, MAX_INSTALLMENTS } from './installments';
import { purchaseFingerprint, type PurchaseIntent } from './purchase-intent';
import { ShippingAddress } from './shipping-address';

describe('ShippingAddress', () => {
  it('should normalize spaces and keep every field', () => {
    const result = ShippingAddress.parse({
      ...DELIVERY,
      recipientName: '  Ana   Pérez ',
      addressLine1: ' Cra 43A  # 1-50 ',
    });

    expect(result.ok && result.value.snapshot).toEqual({
      ...DELIVERY,
      recipientName: 'Ana Pérez',
      addressLine1: 'Cra 43A # 1-50',
    });
  });

  it('should accept an address without the optional line and postal code', () => {
    const result = ShippingAddress.parse({
      ...DELIVERY,
      addressLine2: '   ',
      postalCode: undefined,
    });

    expect(result.ok && result.value.snapshot.addressLine2).toBeUndefined();
    expect(result.ok && result.value.snapshot.postalCode).toBeUndefined();
  });

  it.each([
    [{ recipientName: 'A' }, 'delivery.recipientName'],
    [{ recipientPhone: '6041234567' }, 'delivery.recipientPhone'],
    [{ addressLine1: 'Cr' }, 'delivery.addressLine1'],
    [{ addressLine2: 'x'.repeat(121) }, 'delivery.addressLine2'],
    [{ city: 'M' }, 'delivery.city'],
    [{ region: 'x'.repeat(81) }, 'delivery.region'],
    [{ country: 'US' }, 'delivery.country'],
    [{ postalCode: '0500' }, 'delivery.postalCode'],
  ])('should reject %p on %s', (override, field) => {
    const result = ShippingAddress.parse({ ...DELIVERY, ...override });

    expect(!result.ok && result.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field }],
    });
  });
});

describe('Installments', () => {
  it.each([1, 12, MAX_INSTALLMENTS])('should accept %i', (value) => {
    expect(Installments.of(value).ok).toBe(true);
  });

  it.each([0, 37, 1.5])('should reject %p', (value) => {
    expect(Installments.of(value).ok).toBe(false);
  });
});

describe('purchaseFingerprint', () => {
  const intent: PurchaseIntent = {
    productId: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e01',
    quantity: 2,
    customerId: '11111111-1111-4111-8111-111111111111',
    installments: 1,
    delivery: DELIVERY,
  };

  it('should be a SHA-256 that ignores key order', () => {
    const reordered: PurchaseIntent = {
      delivery: { ...DELIVERY },
      installments: 1,
      customerId: intent.customerId,
      quantity: 2,
      productId: intent.productId,
    };

    expect(purchaseFingerprint(intent, hasher)).toMatch(/^[0-9a-f]{64}$/);
    expect(purchaseFingerprint(reordered, hasher)).toBe(purchaseFingerprint(intent, hasher));
  });

  it('should ignore one-time credentials that travel next to the intent (C-04)', () => {
    const withCredentials = { ...intent, cardToken: 'tok_other', acceptanceToken: 'other' };

    expect(purchaseFingerprint(withCredentials, hasher)).toBe(purchaseFingerprint(intent, hasher));
  });

  it.each<Partial<PurchaseIntent>>([
    { quantity: 3 },
    { installments: 2 },
    { customerId: '22222222-2222-4222-8222-222222222222' },
    { delivery: { ...DELIVERY, city: 'Bogotá' } },
  ])('should change when the purchase changes (%p)', (change) => {
    expect(purchaseFingerprint({ ...intent, ...change }, hasher)).not.toBe(
      purchaseFingerprint(intent, hasher),
    );
  });
});
