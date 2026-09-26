import { type DataSource } from 'typeorm';
import { managerFor } from '../../../../shared/infrastructure/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../../shared/kernel/unit-of-work';
import { type Delivery } from '../../domain/delivery';
import { type DeliveryRepository } from '../../domain/delivery.repository.port';
import { toDelivery, toDeliveryRow } from './delivery.mapper';
import { DeliveryOrmEntity } from './delivery.orm-entity';

export class TypeOrmDeliveryRepository implements DeliveryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async save(delivery: Delivery, tx?: TransactionContext): Promise<void> {
    await this.repository(tx).insert(toDeliveryRow(delivery));
  }

  async findById(id: string): Promise<Delivery | null> {
    const row = await this.repository().findOneBy({ id });
    return row ? toDelivery(row) : null;
  }

  async findIdByTransactionId(
    transactionId: string,
    tx?: TransactionContext,
  ): Promise<string | null> {
    const row = await this.repository(tx).findOne({
      where: { transactionId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private repository(tx?: TransactionContext) {
    return managerFor(this.dataSource, tx).getRepository(DeliveryOrmEntity);
  }
}
