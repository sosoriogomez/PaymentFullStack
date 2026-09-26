import { type DomainError } from '../../../shared/kernel/domain-error';
import { err, type Err } from '../../../shared/kernel/result';

export type ProductNotFound = Extract<DomainError, { code: 'PRODUCT_NOT_FOUND' }>;

export const productNotFound = (productId: string): Err<ProductNotFound> =>
  err({ code: 'PRODUCT_NOT_FOUND', productId });
