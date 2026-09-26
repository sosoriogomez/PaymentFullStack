import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../../shared/infrastructure/http/openapi';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { uuidParam } from '../../../../shared/infrastructure/http/uuid-param';
import { GetProductStock } from '../../application/get-product-stock.use-case';
import { GetProduct } from '../../application/get-product.use-case';
import { ListProducts } from '../../application/list-products.use-case';
import { ListProductsQuery } from './list-products.query';
import { ProductListResponse, ProductResponse, ProductStockResponse } from './product.responses';

@ApiTags('products')
@ApiProblems(429)
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(
    private readonly listProducts: ListProducts,
    private readonly getProduct: GetProduct,
    private readonly getProductStock: GetProductStock,
  ) {}

  @ApiOperation({ summary: 'Products with their stock: available first, sold out last' })
  @ApiProblems(400)
  @Get()
  async list(@Query() query: ListProductsQuery): Promise<ProductListResponse> {
    const products = unwrapOrThrow(await this.listProducts.execute({ limit: query.limit }));
    return { items: products.map((product) => ProductResponse.from(product)) };
  }

  @ApiOperation({ summary: 'One product' })
  @ApiProblems(400, 404)
  @Get(':id')
  async get(@Param('id', uuidParam('id')) id: string): Promise<ProductResponse> {
    return ProductResponse.from(unwrapOrThrow(await this.getProduct.execute(id)));
  }

  @ApiOperation({ summary: 'Units available right now (the stock resource, step 5)' })
  @ApiProblems(400, 404)
  @Get(':id/stock')
  async stock(@Param('id', uuidParam('id')) id: string): Promise<ProductStockResponse> {
    return ProductStockResponse.from(unwrapOrThrow(await this.getProductStock.execute(id)));
  }
}
