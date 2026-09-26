import { map } from '../lib/result';
import {
  acceptanceSchema,
  type CreateTransactionInput,
  customerSchema,
  type CustomerInput,
  deliverySchema,
  productListSchema,
  quoteSchema,
  stockSchema,
  transactionSchema,
} from './contracts';
import { type ApiRequest, type HttpClient } from './http-client';
import { type ApiResult, type CheckoutApi, type CreatedTransaction } from './ports';

const id = (value: string): string => encodeURIComponent(value);

/** Adapter of the CheckoutApi port over HTTP (spec-backend §5, `/api/v1`). */
export class HttpCheckoutApi implements CheckoutApi {
  constructor(private readonly http: HttpClient) {}

  listProducts() {
    return this.get(
      { method: 'GET', path: '/products', schema: productListSchema },
      (body) => body.items,
    );
  }

  getProductStock(productId: string) {
    return this.get({
      method: 'GET',
      path: `/products/${id(productId)}/stock`,
      schema: stockSchema,
    });
  }

  getAcceptance() {
    return this.get({ method: 'GET', path: '/checkout/acceptance', schema: acceptanceSchema });
  }

  getQuote(input: { productId: string; quantity: number }) {
    return this.get({ method: 'GET', path: '/checkout/quote', query: input, schema: quoteSchema });
  }

  registerCustomer(input: CustomerInput) {
    return this.get({ method: 'POST', path: '/customers', body: input, schema: customerSchema });
  }

  async createTransaction(
    input: CreateTransactionInput,
    idempotencyKey: string,
  ): ApiResult<CreatedTransaction> {
    const result = await this.http.send({
      method: 'POST',
      path: '/transactions',
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
      schema: transactionSchema,
    });
    return map(result, (response) => ({
      transaction: response.data,
      replayed: response.headers.get('Idempotent-Replayed') === 'true',
    }));
  }

  getTransaction(transactionId: string) {
    return this.get({
      method: 'GET',
      path: `/transactions/${id(transactionId)}`,
      schema: transactionSchema,
    });
  }

  findTransactionByIdempotencyKey(idempotencyKey: string) {
    return this.get({
      method: 'GET',
      path: '/transactions',
      query: { idempotencyKey },
      schema: transactionSchema,
    });
  }

  getDelivery(deliveryId: string) {
    return this.get({
      method: 'GET',
      path: `/deliveries/${id(deliveryId)}`,
      schema: deliverySchema,
    });
  }

  private get<T>(request: ApiRequest<T>): ApiResult<T>;
  private get<T, U>(request: ApiRequest<T>, select: (body: T) => U): ApiResult<U>;
  private async get<T, U>(request: ApiRequest<T>, select?: (body: T) => U): ApiResult<T | U> {
    const result = await this.http.send(request);
    return map(result, (response) => (select ? select(response.data) : response.data));
  }
}
