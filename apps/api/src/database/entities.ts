import { ProductOrmEntity } from '../modules/products/infrastructure/persistence/product.orm-entity';

/** Every TypeORM entity, listed explicitly: globs do not exist inside a Lambda bundle (I-15). */
export const ENTITIES = [ProductOrmEntity];
