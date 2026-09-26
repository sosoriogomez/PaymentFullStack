import { aProduct } from '../../../../test/builders/product.builder';
import { aTransaction, IDEMPOTENCY_KEY } from '../../../../test/builders/transaction.builder';
import { InMemoryProductRepository } from '../../../../test/fakes/in-memory-product.repository';
import { InMemoryTransactionRepository } from '../../../../test/fakes/in-memory-transaction.repository';
import { FindTransactionByIdempotencyKey } from './find-transaction-by-idempotency-key.use-case';
import { TransactionViews } from './transaction-views';

describe('FindTransactionByIdempotencyKey', () => {
  const products = new InMemoryProductRepository([aProduct().build()]);
  const views = new TransactionViews(products);

  it('should return the transaction created with the key', async () => {
    const transaction = aTransaction().build();
    const useCase = new FindTransactionByIdempotencyKey(
      new InMemoryTransactionRepository([transaction]),
      views,
    );

    const result = await useCase.execute(IDEMPOTENCY_KEY);

    expect(result.ok && result.value.transaction).toBe(transaction);
    expect(result.ok && result.value.product.name).toBe('Audífonos inalámbricos Pulse');
  });

  it('should answer TRANSACTION_NOT_FOUND for an unused key', async () => {
    const useCase = new FindTransactionByIdempotencyKey(new InMemoryTransactionRepository(), views);

    const result = await useCase.execute(IDEMPOTENCY_KEY);

    expect(!result.ok && result.error).toEqual({
      code: 'TRANSACTION_NOT_FOUND',
      by: 'idempotencyKey',
      value: IDEMPOTENCY_KEY,
    });
  });
});

describe('TransactionViews', () => {
  it('should fail loudly when the product of a transaction is missing', async () => {
    const views = new TransactionViews(new InMemoryProductRepository());

    await expect(views.of(aTransaction().build())).rejects.toThrow('is missing');
  });
});
