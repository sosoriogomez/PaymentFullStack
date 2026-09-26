import { aDelivery, aProduct, aTransaction, someAmounts } from '@test/builders';
import {
  acceptanceSchema,
  customerSchema,
  deliverySchema,
  orderAmountsSchema,
  problemSchema,
  productListSchema,
  quoteSchema,
  stockSchema,
  transactionSchema,
} from './contracts';

describe('API contract schemas', () => {
  it('should accept well formed responses', () => {
    expect(productListSchema.parse({ items: [aProduct()] }).items).toHaveLength(1);
    expect(transactionSchema.parse(aTransaction())).toEqual(aTransaction());
    expect(deliverySchema.parse(aDelivery())).toEqual(aDelivery());
    expect(
      quoteSchema.parse({ productId: aProduct().id, quantity: 1, amounts: someAmounts() }).quantity,
    ).toBe(1);
    expect(
      stockSchema.parse({ productId: aProduct().id, available: 3, updatedAt: '2026-10-01' })
        .available,
    ).toBe(3);
    expect(
      customerSchema.parse({
        id: aProduct().id,
        fullName: 'Ana',
        email: 'a***@mail.com',
        phone: '***4567',
      }),
    ).toBeTruthy();
    expect(
      acceptanceSchema.parse({
        acceptanceToken: 'eyJ',
        acceptancePermalink: 'https://gateway.test/terms.pdf',
        personalDataAuthToken: 'eyJ2',
        personalDataAuthPermalink: 'https://gateway.test/data.pdf',
      }).acceptanceToken,
    ).toBe('eyJ');
  });

  it('should reject amounts that are not integer cents', () => {
    expect(orderAmountsSchema.safeParse(someAmounts({ total: 163_000.5 })).success).toBe(false);
    expect(orderAmountsSchema.safeParse(someAmounts({ baseFee: -1 })).success).toBe(false);
  });

  it('should reject unknown transaction statuses', () => {
    expect(transactionSchema.safeParse({ ...aTransaction(), status: 'REFUNDED' }).success).toBe(
      false,
    );
  });

  it('should keep extension members of problem details', () => {
    expect(
      problemSchema.parse({ status: 409, code: 'INSUFFICIENT_STOCK', available: 2 }),
    ).toMatchObject({ available: 2 });
  });
});
