import { aProduct, PRODUCT_ID } from '../../../../test/builders/product.builder';
import {
  aTransaction,
  DELIVERY,
  TRANSACTION_ID,
} from '../../../../test/builders/transaction.builder';
import { InMemoryDeliveryRepository } from '../../../../test/fakes/in-memory-delivery.repository';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { InMemoryTransactionRepository } from '../../../../test/fakes/in-memory-transaction.repository';
import { InMemoryUnitOfWork } from '../../../../test/fakes/in-memory-unit-of-work';
import { FixedClock, NOW, SequentialIdGenerator } from '../../../../test/fakes/kernel';
import { type AlertLog } from '../../../shared/kernel/ports';
import {
  type FinalGatewayStatus,
  type FinalGatewayTransaction,
} from '../../payment-gateway/domain/payment-gateway.port';
import { type Transaction } from '../domain/transaction';
import { FinalizeTransaction } from './finalize-transaction.use-case';

const CARD = { brand: 'VISA', lastFour: '4242' };

const recordOf = (
  transaction: Transaction,
  overrides: Partial<FinalGatewayTransaction> = {},
): FinalGatewayTransaction => ({
  id: 'gw-1',
  reference: transaction.reference,
  status: 'APPROVED',
  statusMessage: null,
  amountInCents: transaction.amounts.total.amountInCents,
  currency: 'COP',
  card: CARD,
  ...overrides,
});

const setup = ({ stock = 5, transaction = aTransaction().with({ quantity: 2 }).build() } = {}) => {
  const transactions = new InMemoryTransactionRepository([transaction]);
  const products = new InMemoryProductRepository([aProduct().withStock(stock).build()]);
  const deliveries = new InMemoryDeliveryRepository();
  const unitOfWork = new InMemoryUnitOfWork();
  const alerts: jest.Mocked<AlertLog> = { warn: jest.fn(), error: jest.fn() };
  const useCase = new FinalizeTransaction({
    unitOfWork,
    transactions,
    products,
    deliveries,
    ids: new SequentialIdGenerator(),
    clock: new FixedClock(),
    alerts,
  });
  const finalize = (overrides: Partial<FinalGatewayTransaction> = {}) =>
    useCase.execute({ transactionId: transaction.id, record: recordOf(transaction, overrides) });
  const stockLeft = async () => (await products.findById(PRODUCT_ID))?.stock;
  return { finalize, transactions, deliveries, unitOfWork, alerts, stockLeft, transaction };
};

describe('FinalizeTransaction', () => {
  it('should approve, take the units from the stock and assign a delivery, atomically', async () => {
    const { finalize, transactions, deliveries, unitOfWork, stockLeft } = setup();

    const result = await finalize();

    expect(result.ok && result.value.changed).toBe(true);
    const stored = await transactions.findById(TRANSACTION_ID);
    expect(stored?.status).toBe('APPROVED');
    expect(stored?.finalizedAt).toEqual(NOW);
    expect(stored?.card).toEqual(CARD);
    expect(await stockLeft()).toBe(3);
    expect(deliveries.all).toHaveLength(1);
    expect(deliveries.all[0]).toMatchObject({
      status: 'ASSIGNED',
      transactionId: TRANSACTION_ID,
      productId: PRODUCT_ID,
      quantity: 2,
      address: DELIVERY,
    });
    expect(unitOfWork.runs).toBe(1);
  });

  it.each<FinalGatewayStatus>(['DECLINED', 'VOIDED', 'ERROR'])(
    'should record %s without touching the stock nor creating a delivery',
    async (status) => {
      const { finalize, transactions, deliveries, stockLeft } = setup();

      await finalize({ status, statusMessage: 'Fondos insuficientes' });

      const stored = await transactions.findById(TRANSACTION_ID);
      expect(stored?.status).toBe(status);
      expect(stored?.statusMessage).toBe('Fondos insuficientes');
      expect(await stockLeft()).toBe(5);
      expect(deliveries.all).toHaveLength(0);
    },
  );

  it('should be idempotent: a final transaction never changes again', async () => {
    const { finalize, deliveries, stockLeft } = setup();
    await finalize();

    const again = await finalize({ status: 'DECLINED' });

    expect(again.ok && again.value.changed).toBe(false);
    expect(again.ok && again.value.transaction.status).toBe('APPROVED');
    expect(await stockLeft()).toBe(3);
    expect(deliveries.all).toHaveLength(1);
  });

  it.each([
    ['another amount', { amountInCents: 1 }],
    ['another currency', { currency: 'USD' }],
    ['another reference', { reference: 'TX-SOMEONE-ELSE' }],
  ])(
    'should end in ERROR AMOUNT_MISMATCH when the gateway reports %s (I-06)',
    async (_, overrides) => {
      const { finalize, transactions, deliveries, alerts, stockLeft } = setup();

      await finalize(overrides);

      const stored = await transactions.findById(TRANSACTION_ID);
      expect(stored?.status).toBe('ERROR');
      expect(stored?.statusMessage).toBe('AMOUNT_MISMATCH');
      expect(stored?.gatewayTransactionId).toBeNull();
      expect(await stockLeft()).toBe(5);
      expect(deliveries.all).toHaveLength(0);
      expect(alerts.error).toHaveBeenCalledWith(
        'AMOUNT_MISMATCH',
        expect.objectContaining({ transactionId: TRANSACTION_ID, gatewayStatus: 'APPROVED' }),
      );
    },
  );

  it('should backorder the delivery when a concurrent purchase took the last units', async () => {
    const { finalize, deliveries, alerts, stockLeft } = setup({ stock: 1 });

    await finalize();

    expect(await stockLeft()).toBe(1);
    expect(deliveries.all[0]?.status).toBe('BACKORDERED');
    expect(alerts.warn).toHaveBeenCalledWith('BACKORDERED', {
      transactionId: TRANSACTION_ID,
      productId: PRODUCT_ID,
      quantity: 2,
    });
  });

  it('should store the gateway id when it was found by reference', async () => {
    const { finalize, transactions } = setup();

    await finalize({ id: 'gw-by-reference' });

    expect((await transactions.findById(TRANSACTION_ID))?.gatewayTransactionId).toBe(
      'gw-by-reference',
    );
  });

  it('should keep the gateway id it already had', async () => {
    const { finalize, transactions } = setup({
      transaction: aTransaction().with({ gatewayTransactionId: 'gw-original' }).build(),
    });

    await finalize({ id: 'gw-other' });

    expect((await transactions.findById(TRANSACTION_ID))?.gatewayTransactionId).toBe('gw-original');
  });

  it('should report no change when another path finalized it in between', async () => {
    const { finalize, transactions, deliveries, stockLeft, transaction } = setup();
    jest.spyOn(transactions, 'updateIfPending').mockResolvedValueOnce(false);
    jest
      .spyOn(transactions, 'findById')
      .mockResolvedValueOnce(transaction)
      .mockResolvedValueOnce(aTransaction().with({ status: 'DECLINED', finalizedAt: NOW }).build());

    const result = await finalize();

    expect(result.ok && result.value).toMatchObject({
      changed: false,
      transaction: { status: 'DECLINED' },
    });
    expect(await stockLeft()).toBe(5);
    expect(deliveries.all).toHaveLength(0);
  });

  it('should keep its own result if the winner cannot be read back', async () => {
    const { finalize, transactions, transaction } = setup();
    jest.spyOn(transactions, 'updateIfPending').mockResolvedValueOnce(false);
    jest
      .spyOn(transactions, 'findById')
      .mockResolvedValueOnce(transaction)
      .mockResolvedValueOnce(null);

    const result = await finalize();

    expect(result.ok && result.value.transaction.status).toBe('APPROVED');
  });

  it('should answer TRANSACTION_NOT_FOUND for an unknown id', async () => {
    const { finalize, transactions } = setup();
    jest.spyOn(transactions, 'findById').mockResolvedValueOnce(null);

    const result = await finalize();

    expect(!result.ok && result.error).toEqual({
      code: 'TRANSACTION_NOT_FOUND',
      by: 'id',
      value: TRANSACTION_ID,
    });
  });
});
