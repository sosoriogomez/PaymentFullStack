import { type Delivery } from '../../src/modules/deliveries/domain/delivery';
import { type DeliveryRepository } from '../../src/modules/deliveries/domain/delivery.repository.port';

/** Same contract as the Postgres adapter, including one delivery per transaction. */
export class InMemoryDeliveryRepository implements DeliveryRepository {
  private readonly byId = new Map<string, Delivery>();

  get all(): Delivery[] {
    return [...this.byId.values()];
  }

  save(delivery: Delivery): Promise<void> {
    if (this.all.some((stored) => stored.transactionId === delivery.transactionId)) {
      return Promise.reject(
        new Error(`Transaction ${delivery.transactionId} already has a delivery`),
      );
    }
    this.byId.set(delivery.id, delivery);
    return Promise.resolve();
  }

  findById(id: string): Promise<Delivery | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  findIdByTransactionId(transactionId: string): Promise<string | null> {
    return Promise.resolve(
      this.all.find((stored) => stored.transactionId === transactionId)?.id ?? null,
    );
  }
}
