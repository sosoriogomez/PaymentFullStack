import { cop } from '../../../../test/builders/product.builder';
import { aTransaction, DELIVERY } from '../../../../test/builders/transaction.builder';
import { Money } from '../../../shared/kernel/money';
import { type Result } from '../../../shared/kernel/result';
import { type OrderAmounts } from '../../checkout/domain/order-amounts';
import { Quantity } from '../../checkout/domain/quantity';
import { Installments } from './installments';
import { ShippingAddress } from './shipping-address';
import { MAX_STATUS_MESSAGE_LENGTH, type NewTransaction, Transaction } from './transaction';
import { type FinalStatus } from './transaction-status';

const valid = <T>(result: Result<T, unknown>): T => {
  if (!result.ok) throw new Error(`invalid test value: ${JSON.stringify(result.error)}`);
  return result.value;
};

const AMOUNTS: OrderAmounts = {
  product: cop(300_000_00),
  baseFee: cop(3_000_00),
  deliveryFee: cop(10_000_00),
  total: cop(313_000_00),
};
const AT = new Date('2026-10-01T15:05:00.000Z');

const newTransaction = (overrides: Partial<NewTransaction> = {}): NewTransaction => ({
  id: '33333333-3333-4333-8333-333333333333',
  reference: 'TX-TEST0001',
  productId: '6f1d8a4e-3c2b-4a1e-9b7d-0a1b2c3d4e01',
  customerId: '11111111-1111-4111-8111-111111111111',
  quantity: valid(Quantity.of(2)),
  amounts: AMOUNTS,
  installments: valid(Installments.of(3)),
  shipping: valid(ShippingAddress.parse(DELIVERY)),
  idempotencyKey: '7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f',
  requestHash: 'f'.repeat(64),
  createdAt: new Date('2026-10-01T15:00:00.000Z'),
  ...overrides,
});

describe('Transaction', () => {
  describe('createPending', () => {
    it('should start PENDING, without gateway data, keeping the priced amounts', () => {
      const transaction = valid(Transaction.createPending(newTransaction()));

      expect(transaction.status).toBe('PENDING');
      expect(transaction.isFinal).toBe(false);
      expect(transaction.quantity).toBe(2);
      expect(transaction.installments).toBe(3);
      expect(transaction.amounts.total.amountInCents).toBe(313_000_00);
      expect(transaction.shipping.city).toBe('Medellín');
      expect(transaction.gatewayTransactionId).toBeNull();
      expect(transaction.card).toBeNull();
      expect(transaction.statusMessage).toBeNull();
      expect(transaction.finalizedAt).toBeNull();
      expect(transaction.createdAt).toEqual(new Date('2026-10-01T15:00:00.000Z'));
      expect(transaction.reference).toBe('TX-TEST0001');
      expect(transaction.idempotencyKey).toBe('7b1d3f0e-8c2a-4b5d-9e6f-0a1b2c3d4e5f');
    });

    it('should reject a total that is not the sum of its components', () => {
      const result = Transaction.createPending(
        newTransaction({ amounts: { ...AMOUNTS, total: cop(1) } }),
      );

      expect(!result.ok && result.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'amounts' }],
      });
    });

    it('should only accept COP', () => {
      const usd = (cents: number) => valid(Money.of(cents, 'USD'));
      const result = Transaction.createPending(
        newTransaction({
          amounts: { product: usd(100), baseFee: usd(1), deliveryFee: usd(1), total: usd(102) },
        }),
      );

      expect(!result.ok && result.error).toMatchObject({ details: [{ field: 'currency' }] });
    });

    it('should reject amounts in different currencies', () => {
      const result = Transaction.createPending(
        newTransaction({ amounts: { ...AMOUNTS, baseFee: valid(Money.of(1, 'USD')) } }),
      );

      expect(result.ok).toBe(false);
    });
  });

  describe('recordCharge', () => {
    it('should keep the status PENDING and store the gateway id and card', () => {
      const card = { brand: 'VISA', lastFour: '4242' };

      const charged = valid(
        aTransaction().build().recordCharge({ gatewayTransactionId: 'gw-1', card }),
      );

      expect(charged.status).toBe('PENDING');
      expect(charged.gatewayTransactionId).toBe('gw-1');
      expect(charged.card).toEqual(card);
    });

    it('should not touch a final transaction', () => {
      const result = aTransaction()
        .with({ status: 'DECLINED', finalizedAt: AT })
        .build()
        .recordCharge({ gatewayTransactionId: 'gw-1', card: null });

      expect(!result.ok && result.error).toEqual({
        code: 'INVALID_STATE_TRANSITION',
        from: 'DECLINED',
        to: 'PENDING',
      });
    });
  });

  describe('finalize', () => {
    it.each<FinalStatus>(['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'])(
      'should move PENDING to %s with its finalization time, without mutating the original',
      (status) => {
        const pending = aTransaction().build();

        const final = valid(pending.finalize({ status, statusMessage: null }, AT));

        expect(final.status).toBe(status);
        expect(final.isFinal).toBe(true);
        expect(final.finalizedAt).toEqual(AT);
        expect(pending.status).toBe('PENDING');
      },
    );

    it('should never change a final status again', () => {
      const approved = valid(
        aTransaction().build().finalize({ status: 'APPROVED', statusMessage: null }, AT),
      );

      const result = approved.finalize({ status: 'DECLINED', statusMessage: null }, AT);

      expect(!result.ok && result.error).toEqual({
        code: 'INVALID_STATE_TRANSITION',
        from: 'APPROVED',
        to: 'DECLINED',
      });
    });

    it('should cut the status message to the column length and keep a known card', () => {
      const card = { brand: 'MASTERCARD', lastFour: '4444' };
      const pending = aTransaction().with({ card }).build();

      const final = valid(
        pending.finalize({ status: 'ERROR', statusMessage: 'x'.repeat(300) }, AT),
      );

      expect(final.statusMessage).toHaveLength(MAX_STATUS_MESSAGE_LENGTH);
      expect(final.card).toEqual(card);
    });

    it('should take the card reported at finalization', () => {
      const card = { brand: 'VISA', lastFour: '4242' };

      const final = valid(
        aTransaction().build().finalize({ status: 'APPROVED', statusMessage: null, card }, AT),
      );

      expect(final.card).toEqual(card);
    });
  });

  it('should recognize the same request by its hash', () => {
    const transaction = aTransaction()
      .with({ requestHash: 'b'.repeat(64) })
      .build();

    expect(transaction.isSameRequest('b'.repeat(64))).toBe(true);
    expect(transaction.isSameRequest('c'.repeat(64))).toBe(false);
  });
});
