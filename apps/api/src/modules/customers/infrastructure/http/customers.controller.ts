import { Body, Controller, Get, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../../shared/infrastructure/http/openapi';
import { type Response } from 'express';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { uuidParam } from '../../../../shared/infrastructure/http/uuid-param';
import { GetCustomer } from '../../application/get-customer.use-case';
import { RegisterCustomer } from '../../application/register-customer.use-case';
import { CustomerResponse } from './customer.response';
import { RegisterCustomerRequest } from './register-customer.request';

@ApiTags('customers')
@ApiProblems(429)
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(
    private readonly registerCustomer: RegisterCustomer,
    private readonly getCustomer: GetCustomer,
  ) {}

  /** Upsert by email: 201 + Location when new, 200 when the email already existed. */
  @ApiOperation({ summary: 'Registers a guest customer, or updates it when the email exists' })
  @ApiCreatedResponse({ type: CustomerResponse, description: 'New customer (Location header)' })
  @ApiOkResponse({ type: CustomerResponse, description: 'The email already existed' })
  @ApiProblems(400, 413)
  @Post()
  async register(
    @Body() body: RegisterCustomerRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CustomerResponse> {
    const { customer, created } = unwrapOrThrow(await this.registerCustomer.execute(body));
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    if (created) response.location(`/api/v1/customers/${customer.id}`);
    return CustomerResponse.from(customer);
  }

  @ApiOperation({ summary: 'A customer, with email and phone masked' })
  @ApiProblems(400, 404)
  @Get(':id')
  async get(@Param('id', uuidParam('id')) id: string): Promise<CustomerResponse> {
    return CustomerResponse.from(unwrapOrThrow(await this.getCustomer.execute(id)));
  }
}
