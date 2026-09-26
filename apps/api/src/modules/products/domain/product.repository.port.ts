import { type TransactionContext } from '../../../shared/kernel/unit-of-work';
import { type Product } from './product';

export interface ProductRepository {
  findAll(limit: number): Promise<Product[]>;
  findById(id: string, tx?: TransactionContext): Promise<Product | null>;
}

export const PRODUCT_REPOSITORY = Symbol('ProductRepository');
