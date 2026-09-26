import { CustomerOrmEntity } from '../modules/customers/infrastructure/persistence/customer.orm-entity';
import { ProductOrmEntity } from '../modules/products/infrastructure/persistence/product.orm-entity';
import { TransactionOrmEntity } from '../modules/transactions/infrastructure/persistence/transaction.orm-entity';

/** Every TypeORM entity, listed explicitly: globs do not exist inside a Lambda bundle (I-15). */
export const ENTITIES = [ProductOrmEntity, CustomerOrmEntity, TransactionOrmEntity];
