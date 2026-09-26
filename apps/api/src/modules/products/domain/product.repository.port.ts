import { type TransactionContext } from '../../../shared/kernel/unit-of-work';
import { type Product } from './product';

export interface ProductRepository {
  findAll(limit: number): Promise<Product[]>;
  findById(id: string, tx?: TransactionContext): Promise<Product | null>;
  /**
   * Atomic `stock = stock - quantity` only when enough units remain (never negative). Returns
   * false when a concurrent purchase took them first.
   */
  decrementStockIfAvailable(
    productId: string,
    quantity: number,
    tx?: TransactionContext,
  ): Promise<boolean>;
}

export const PRODUCT_REPOSITORY = Symbol('ProductRepository');
