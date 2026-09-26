import { Controller, Get, Query } from '@nestjs/common';
import { unwrapOrThrow } from '../../../../shared/infrastructure/http/unwrap';
import { GetQuote } from '../../application/get-quote.use-case';
import { inCents } from '../../domain/order-amounts';
import { type QuoteResponse } from './checkout.responses';
import { QuoteQuery } from './quote.query';

@Controller({ path: 'checkout', version: '1' })
export class CheckoutController {
  constructor(private readonly getQuote: GetQuote) {}

  @Get('quote')
  async quote(@Query() query: QuoteQuery): Promise<QuoteResponse> {
    const quote = unwrapOrThrow(await this.getQuote.execute(query));
    return {
      productId: quote.product.id,
      quantity: quote.quantity.value,
      amounts: inCents(quote.amounts),
    };
  }
}
