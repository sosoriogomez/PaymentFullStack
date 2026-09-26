import { type TransactionContext } from '../../../shared/kernel/unit-of-work';
import { type Delivery } from './delivery';

export interface DeliveryRepository {
  save(delivery: Delivery, tx?: TransactionContext): Promise<void>;
  findById(id: string): Promise<Delivery | null>;
  findIdByTransactionId(transactionId: string, tx?: TransactionContext): Promise<string | null>;
}

export const DELIVERY_REPOSITORY = Symbol('DeliveryRepository');
