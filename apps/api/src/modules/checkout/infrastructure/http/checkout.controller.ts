import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../../../../shared/infrastructure/http/openapi';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { GetAcceptance } from '../../application/get-acceptance.use-case';
import { GetQuote } from '../../application/get-quote.use-case';
import { inCents } from '../../domain/order-amounts';
import { type AcceptanceResponse, type QuoteResponse } from './checkout.responses';
import { QuoteQuery } from './quote.query';

@ApiTags('checkout')
@ApiProblems(429)
@Controller({ path: 'checkout', version: '1' })
export class CheckoutController {
  constructor(
    private readonly getQuote: GetQuote,
    private readonly getAcceptance: GetAcceptance,
  ) {}

  @ApiOperation({ summary: 'Price breakdown in cents: product × quantity + base fee + delivery' })
  @ApiProblems(400, 404, 409)
  @Get('quote')
  async quote(@Query() query: QuoteQuery): Promise<QuoteResponse> {
    const quote = unwrapOrThrow(await this.getQuote.execute(query));
    return {
      productId: quote.product.id,
      quantity: quote.quantity.value,
      amounts: inCents(quote.amounts),
    };
  }

  /** Acceptance tokens and permalinks of the terms, fresh on every call: the tokens are single use. */
  @ApiOperation({ summary: 'Contracts to accept before paying, with links to read them' })
  @ApiProblems(502, 503)
  @Get('acceptance')
  async acceptance(): Promise<AcceptanceResponse> {
    return unwrapOrThrow(await this.getAcceptance.execute());
  }
}
