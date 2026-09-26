import { Body, Controller, Get, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { type Response } from 'express';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { uuidParam } from '../../../../shared/infrastructure/http/uuid-param';
import { GetCustomer } from '../../application/get-customer.use-case';
import { RegisterCustomer } from '../../application/register-customer.use-case';
import { CustomerResponse } from './customer.response';
import { RegisterCustomerRequest } from './register-customer.request';

@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(
    private readonly registerCustomer: RegisterCustomer,
    private readonly getCustomer: GetCustomer,
  ) {}

  /** Upsert by email: 201 + Location when new, 200 when the email already existed. */
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

  @Get(':id')
  async get(@Param('id', uuidParam('id')) id: string): Promise<CustomerResponse> {
    return CustomerResponse.from(unwrapOrThrow(await this.getCustomer.execute(id)));
  }
}
