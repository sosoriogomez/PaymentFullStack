import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GetProductStock } from './application/get-product-stock.use-case';
import { GetProduct } from './application/get-product.use-case';
import { ListProducts } from './application/list-products.use-case';
import { PRODUCT_REPOSITORY, type ProductRepository } from './domain/product.repository.port';
import { ProductsController } from './infrastructure/http/products.controller';
import { TypeOrmProductRepository } from './infrastructure/persistence/typeorm-product.repository';

/** Use cases are plain classes: the module wires them with factory providers (no Nest in application/). */
@Module({
  controllers: [ProductsController],
  providers: [
    {
      provide: PRODUCT_REPOSITORY,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmProductRepository(ds),
    },
    {
      provide: ListProducts,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (repo: ProductRepository) => new ListProducts(repo),
    },
    {
      provide: GetProduct,
      inject: [PRODUCT_REPOSITORY],
      useFactory: (repo: ProductRepository) => new GetProduct(repo),
    },
    {
      provide: GetProductStock,
      inject: [GetProduct],
      useFactory: (getProduct: GetProduct) => new GetProductStock(getProduct),
    },
  ],
  exports: [PRODUCT_REPOSITORY],
})
export class ProductsModule {}
