import { type DataSource } from 'typeorm';
import { managerFor } from '../../../../shared/infrastructure/database/typeorm-unit-of-work';
import { type TransactionContext } from '../../../../shared/kernel/unit-of-work';
import { type Customer } from '../../domain/customer';
import {
  type CustomerRepository,
  type UpsertedCustomer,
} from '../../domain/customer.repository.port';
import { toCustomer } from './customer.mapper';
import { CustomerOrmEntity } from './customer.orm-entity';

interface UpsertRow {
  readonly id: string;
  readonly email: string;
  readonly full_name: string;
  readonly phone: string;
  readonly created: boolean;
}

export class TypeOrmCustomerRepository implements CustomerRepository {
  constructor(private readonly dataSource: DataSource) {}

  /** `xmax = 0` is true only for a freshly inserted row: tells 201 from 200 in one statement. */
  async upsertByEmail(customer: Customer): Promise<UpsertedCustomer> {
    const rows = await this.dataSource.query<UpsertRow[]>(
      `INSERT INTO customers (id, email, full_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, updated_at = now()
       RETURNING id, email, full_name, phone, (xmax = 0) AS created`,
      [customer.id, customer.email, customer.fullName, customer.phone],
    );
    const row = rows[0];
    if (!row) throw new Error('Customer upsert returned no row');
    return {
      customer: toCustomer({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        phone: row.phone,
      }),
      created: row.created,
    };
  }

  async findById(id: string, tx?: TransactionContext): Promise<Customer | null> {
    const row = await managerFor(this.dataSource, tx)
      .getRepository(CustomerOrmEntity)
      .findOneBy({ id });
    return row ? toCustomer(row) : null;
  }
}
