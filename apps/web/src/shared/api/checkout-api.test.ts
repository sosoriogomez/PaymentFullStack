/** @jest-environment node */
import { aDelivery, aProduct, aTransaction, someAmounts } from '@test/builders';
import { fakeFetch, jsonResponse, lastCall } from '@test/support/fake-fetch';
import { ok } from '../lib/result';
import { HttpCheckoutApi } from './checkout-api';
import { HttpClient } from './http-client';

const apiWith = (...responses: Response[]) => {
  const fetchFn = fakeFetch(...responses);
  return { api: new HttpCheckoutApi(new HttpClient('/api/v1', fetchFn)), fetchFn };
};

describe('HttpCheckoutApi', () => {
  it('should list products from the items envelope', async () => {
    const { api, fetchFn } = apiWith(jsonResponse(200, { items: [aProduct()] }));

    expect(await api.listProducts()).toEqual(ok([aProduct()]));
    expect(lastCall(fetchFn)).toMatchObject({ url: '/api/v1/products', init: { method: 'GET' } });
  });

  it('should read the stock of a product', async () => {
    const stock = { productId: aProduct().id, available: 4, updatedAt: '2026-10-01T15:00:00Z' };
    const { api, fetchFn } = apiWith(jsonResponse(200, stock));

    expect(await api.getProductStock(aProduct().id)).toEqual(ok(stock));
    expect(lastCall(fetchFn).url).toBe(`/api/v1/products/${aProduct().id}/stock`);
  });

  it('should get the acceptance tokens and a quote', async () => {
    const acceptance = {
      acceptanceToken: 'a',
      acceptancePermalink: 'https://gateway.test/a.pdf',
      personalDataAuthToken: 'b',
      personalDataAuthPermalink: 'https://gateway.test/b.pdf',
    };
    const quote = { productId: aProduct().id, quantity: 2, amounts: someAmounts() };
    const { api, fetchFn } = apiWith(jsonResponse(200, acceptance), jsonResponse(200, quote));

    expect(await api.getAcceptance()).toEqual(ok(acceptance));
    expect(await api.getQuote({ productId: aProduct().id, quantity: 2 })).toEqual(ok(quote));
    expect(lastCall(fetchFn).url).toBe(
      `/api/v1/checkout/quote?productId=${aProduct().id}&quantity=2`,
    );
  });

  it('should register a customer', async () => {
    const customer = {
      id: aProduct().id,
      fullName: 'Ana Pérez',
      email: 'a***@mail.com',
      phone: '***4567',
    };
    const { api, fetchFn } = apiWith(jsonResponse(201, customer));

    const input = { fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '3001234567' };
    expect(await api.registerCustomer(input)).toEqual(ok(customer));
    expect(lastCall(fetchFn)).toMatchObject({
      url: '/api/v1/customers',
      init: { method: 'POST' },
      body: input,
    });
  });

  it('should create a transaction with the idempotency key and detect replays', async () => {
    const { api, fetchFn } = apiWith(
      jsonResponse(201, aTransaction()),
      jsonResponse(200, aTransaction(), { 'Idempotent-Replayed': 'true' }),
    );
    const input = {
      productId: aProduct().id,
      quantity: 1,
      customerId: aProduct().id,
      delivery: {
        recipientName: 'Ana',
        recipientPhone: '3001234567',
        addressLine1: 'Cra 1',
        city: 'Cali',
        region: 'Valle del Cauca',
        country: 'CO' as const,
      },
      payment: { cardToken: 'tok', installments: 1, acceptanceToken: 'a', acceptPersonalAuth: 'b' },
    };

    expect(await api.createTransaction(input, 'key-1')).toEqual(
      ok({ transaction: aTransaction(), replayed: false }),
    );
    expect(await api.createTransaction(input, 'key-1')).toEqual(
      ok({ transaction: aTransaction(), replayed: true }),
    );
    expect(lastCall(fetchFn).init.headers).toMatchObject({ 'Idempotency-Key': 'key-1' });
  });

  it('should read transactions by id or idempotency key and deliveries by id', async () => {
    const { api, fetchFn } = apiWith(
      jsonResponse(200, aTransaction()),
      jsonResponse(200, aTransaction()),
      jsonResponse(200, aDelivery()),
    );

    expect(await api.getTransaction('t/1')).toEqual(ok(aTransaction()));
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/v1/transactions/t%2F1');
    expect(await api.findTransactionByIdempotencyKey('key-1')).toEqual(ok(aTransaction()));
    expect(fetchFn.mock.calls[1]?.[0]).toBe('/api/v1/transactions?idempotencyKey=key-1');
    expect(await api.getDelivery(aDelivery().id)).toEqual(ok(aDelivery()));
  });
});
