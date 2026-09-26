import { aCustomer, CUSTOMER_ID } from '../../../../test/builders/customer.builder';
import { aProduct, PRODUCT_ID } from '../../../../test/builders/product.builder';
import { DELIVERY, IDEMPOTENCY_KEY, PAYMENT } from '../../../../test/builders/transaction.builder';
import { FAKE_CARD, FakePaymentGateway } from '../../../../test/fakes/fake-payment-gateway';
import { InMemoryDeliveryRepository } from '../../../../test/fakes/in-memory-delivery.repository';
import { InMemoryCustomerRepository } from '../../../../test/fakes/in-memory-customer.repository';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { InMemoryTransactionRepository } from '../../../../test/fakes/in-memory-transaction.repository';
import {
  FixedClock,
  hasher,
  NOW,
  SequentialIdGenerator,
  SequentialReferences,
} from '../../../../test/fakes/kernel';
import { FlatFeePolicy } from '../../checkout/domain/flat-fee.policy';
import { type Result } from '../../../shared/kernel/result';
import {
  CreateTransaction,
  type CreateTransactionCommand,
  type CreateTransactionOutcome,
} from './create-transaction.use-case';
import { TransactionViews } from './transaction-views';

const command = (overrides: Partial<CreateTransactionCommand> = {}): CreateTransactionCommand => ({
  idempotencyKey: IDEMPOTENCY_KEY,
  productId: PRODUCT_ID,
  quantity: 2,
  customerId: CUSTOMER_ID,
  delivery: DELIVERY,
  payment: PAYMENT,
  ...overrides,
});

const setup = ({ stock = 5 }: { stock?: number } = {}) => {
  const transactions = new InMemoryTransactionRepository();
  const products = new InMemoryProductRepository([
    aProduct().withStock(stock).withPrice(150_000_00).build(),
  ]);
  const gateway = new FakePaymentGateway();
  const useCase = new CreateTransaction({
    transactions,
    products,
    customers: new InMemoryCustomerRepository([aCustomer()]),
    gateway,
    fees: new FlatFeePolicy({
      baseFeeInCents: 3_000_00,
      deliveryFeeInCents: 10_000_00,
      currency: 'COP',
    }),
    references: new SequentialReferences(),
    ids: new SequentialIdGenerator(),
    clock: new FixedClock(),
    hasher,
    views: new TransactionViews(products, new InMemoryDeliveryRepository()),
  });
  return { useCase, transactions, products, gateway };
};

const outcomeOf = (result: Result<CreateTransactionOutcome, unknown>) => {
  if (!result.ok) throw new Error(`unexpected error: ${JSON.stringify(result.error)}`);
  return result.value;
};

describe('CreateTransaction', () => {
  it('should commit a PENDING transaction, charge it once and keep the stock untouched', async () => {
    const { useCase, transactions, products } = setup();

    const result = await useCase.execute(command());

    const { kind, view } = outcomeOf(result);
    expect(kind).toBe('created');
    expect(view.transaction.status).toBe('PENDING');
    expect(view.transaction.reference).toBe('TX-TEST0001');
    expect(view.transaction.gatewayTransactionId).toBe('fake-0001');
    expect(view.transaction.card).toEqual(FAKE_CARD);
    expect(view.transaction.amounts.total.amountInCents).toBe(313_000_00);
    expect(view.product).toEqual({ id: PRODUCT_ID, name: 'Audífonos inalámbricos Pulse' });
    expect(view.deliveryId).toBeNull();
    expect((await products.findById(PRODUCT_ID))?.stock).toBe(5);
    expect(transactions.all).toHaveLength(1);
    expect(transactions.all[0]?.gatewayTransactionId).toBe('fake-0001');
  });

  it('should send the priced amount, the customer, the address and the tokens to the gateway', async () => {
    const { useCase, gateway } = setup();

    await useCase.execute(command());

    expect(gateway.charges).toEqual([
      {
        reference: 'TX-TEST0001',
        amountInCents: 313_000_00,
        currency: 'COP',
        customerEmail: 'ana@mail.com',
        customer: { fullName: 'Ana Pérez', phone: '3001234567' },
        cardToken: PAYMENT.cardToken,
        installments: 1,
        acceptanceToken: PAYMENT.acceptanceToken,
        acceptPersonalAuth: PAYMENT.acceptPersonalAuth,
        shipping: DELIVERY,
      },
    ]);
  });

  describe('idempotency', () => {
    it('should replay the same key and purchase without charging again', async () => {
      const { useCase, gateway } = setup();
      const first = await useCase.execute(command());

      const second = await useCase.execute(command());

      expect(second.ok && second.value.kind).toBe('replayed');
      expect(second.ok && second.value.view.transaction.id).toBe(
        first.ok && first.value.view.transaction.id,
      );
      expect(gateway.charges).toHaveLength(1);
    });

    it('should replay when only the one-time credentials changed (card entered again, C-04)', async () => {
      const { useCase, gateway } = setup();
      await useCase.execute(command());

      const retry = await useCase.execute(
        command({
          payment: {
            ...PAYMENT,
            cardToken: 'tok_new',
            acceptanceToken: 'new',
            acceptPersonalAuth: 'new',
          },
        }),
      );

      expect(retry.ok && retry.value.kind).toBe('replayed');
      expect(gateway.charges).toHaveLength(1);
    });

    it('should reject the same key for another purchase', async () => {
      const { useCase, gateway } = setup();
      await useCase.execute(command());

      const result = await useCase.execute(command({ quantity: 3 }));

      expect(!result.ok && result.error).toEqual({
        code: 'IDEMPOTENCY_CONFLICT',
        idempotencyKey: IDEMPOTENCY_KEY,
      });
      expect(gateway.charges).toHaveLength(1);
    });

    it('should charge once when two requests with the same key race', async () => {
      const { useCase, transactions, gateway } = setup();

      const results = await Promise.all([useCase.execute(command()), useCase.execute(command())]);

      expect(results.map((result) => result.ok && result.value.kind).sort()).toEqual([
        'created',
        'replayed',
      ]);
      expect(transactions.all).toHaveLength(1);
      expect(gateway.charges).toHaveLength(1);
    });

    it('should fail loudly if the key is taken but its transaction cannot be read', async () => {
      const { useCase, transactions } = setup();
      jest.spyOn(transactions, 'insertPending').mockResolvedValue('duplicate-idempotency-key');

      await expect(useCase.execute(command())).rejects.toThrow('is taken but not found');
    });
  });

  describe('gateway answers', () => {
    it('should keep the transaction in ERROR with the reason when the charge is rejected', async () => {
      const { useCase, transactions, gateway } = setup();
      gateway.failOn('charge', { code: 'GATEWAY_REJECTED', reason: 'INPUT_VALIDATION_ERROR' });

      const result = await useCase.execute(command());

      expect(result.ok && result.value.kind).toBe('created');
      expect(transactions.all[0]?.status).toBe('ERROR');
      expect(transactions.all[0]?.statusMessage).toBe('INPUT_VALIDATION_ERROR');
      expect(transactions.all[0]?.finalizedAt).toEqual(NOW);
    });

    it.each([
      ['a timeout', { code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' }],
      ['a 5xx', { code: 'GATEWAY_UNAVAILABLE', cause: 'HTTP_5XX' }],
    ] as const)('should stay PENDING without gateway id after %s', async (_, error) => {
      const { useCase, transactions, gateway } = setup();
      gateway.failOn('charge', error);

      const result = await useCase.execute(command());

      expect(result.ok && result.value.view.transaction.status).toBe('PENDING');
      expect(transactions.all[0]?.gatewayTransactionId).toBeNull();
    });

    it('should stay PENDING when the gateway recorded the charge but the answer was lost', async () => {
      const { useCase, transactions, gateway } = setup();
      gateway.willCharge({ initial: 'PENDING', responseLost: true });

      await useCase.execute(command());

      expect(transactions.all[0]?.status).toBe('PENDING');
      const recorded = await gateway.findTransactionByReference('TX-TEST0001');
      expect(recorded.ok && recorded.value?.reference).toBe('TX-TEST0001');
    });

    it('should return the stored state when another process finalized it during the charge', async () => {
      const { useCase, transactions, gateway } = setup();
      const charge = gateway.createCardTransaction.bind(gateway);
      jest.spyOn(gateway, 'createCardTransaction').mockImplementationOnce(async (request) => {
        const [pending] = transactions.all;
        const approved = pending?.finalize({ status: 'APPROVED', statusMessage: null }, NOW);
        if (approved?.ok) await transactions.updateIfPending(approved.value);
        return charge(request);
      });

      const result = await useCase.execute(command());

      expect(result.ok && result.value.view.transaction.status).toBe('APPROVED');
      expect(transactions.all[0]?.status).toBe('APPROVED');
    });

    it('should fall back to its own state when the row cannot be read after losing the guard', async () => {
      const { useCase, transactions, gateway } = setup();
      jest.spyOn(transactions, 'updateIfPending').mockResolvedValue(false);
      jest.spyOn(transactions, 'findById').mockResolvedValue(null);
      gateway.willCharge({ initial: 'PENDING' });

      const result = await useCase.execute(command());

      expect(result.ok && result.value.view.transaction.gatewayTransactionId).toBe('fake-0001');
    });
  });

  describe('validation before charging', () => {
    it('should answer INSUFFICIENT_STOCK without creating or charging anything', async () => {
      const { useCase, transactions, gateway } = setup({ stock: 1 });

      const result = await useCase.execute(command({ quantity: 2 }));

      expect(!result.ok && result.error).toEqual({
        code: 'INSUFFICIENT_STOCK',
        available: 1,
        requested: 2,
      });
      expect(transactions.all).toHaveLength(0);
      expect(gateway.charges).toHaveLength(0);
    });

    it.each([
      [{ productId: '00000000-0000-4000-8000-000000000000' }, 'PRODUCT_NOT_FOUND'],
      [{ customerId: '00000000-0000-4000-8000-000000000000' }, 'CUSTOMER_NOT_FOUND'],
      [{ quantity: 11 }, 'VALIDATION_ERROR'],
      [{ payment: { ...PAYMENT, installments: 0 } }, 'VALIDATION_ERROR'],
      [{ delivery: { ...DELIVERY, country: 'US' } }, 'VALIDATION_ERROR'],
    ])('should reject %p with %s', async (override, code) => {
      const { useCase, transactions, gateway } = setup();

      const result = await useCase.execute(command(override));

      expect(!result.ok && result.error.code).toBe(code);
      expect(transactions.all).toHaveLength(0);
      expect(gateway.charges).toHaveLength(0);
    });
  });
});
