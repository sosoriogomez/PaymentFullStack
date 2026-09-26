import { fixture } from '../../../../test/support/fake-gateway-fetch';
import { rejectionReason, toChargeBody, toGatewayTransaction } from './gateway.mapper';
import { gatewayErrorBodySchema, transactionResponseSchema } from './gateway.schemas';

const rawTransaction = () => transactionResponseSchema.parse(fixture('transaction-pending')).data;

describe('gateway mapper', () => {
  it('should map a gateway transaction with its card metadata', () => {
    expect(toGatewayTransaction(rawTransaction())).toEqual({
      transaction: {
        id: '15113-1790866800-10001',
        reference: 'TX-01J9ZK3Q8Y2M4N6P7R8S9T0V1W',
        status: 'PENDING',
        statusMessage: null,
        amountInCents: 16_300_000,
        currency: 'COP',
        card: { brand: 'VISA', lastFour: '4242' },
      },
      unknownStatus: null,
    });
  });

  it('should keep unknown statuses as PENDING and report them', () => {
    const mapped = toGatewayTransaction({ ...rawTransaction(), status: 'REFUNDED' });

    expect(mapped.transaction.status).toBe('PENDING');
    expect(mapped.unknownStatus).toBe('REFUNDED');
  });

  it('should tolerate transactions without card data', () => {
    expect(
      toGatewayTransaction({ ...rawTransaction(), payment_method: null }).transaction.card,
    ).toBeNull();
  });

  it('should build the charge body with the national shipping phone and the dialing code for the customer', () => {
    const body = toChargeBody(
      {
        reference: 'TX-1',
        amountInCents: 16_300_000,
        currency: 'COP',
        customerEmail: 'ana@mail.com',
        customer: { fullName: 'Ana Pérez', phone: '3001234567' },
        cardToken: 'tok_test',
        installments: 3,
        acceptanceToken: 'acc',
        acceptPersonalAuth: 'pers',
        shipping: {
          recipientName: 'Ana Pérez',
          recipientPhone: '3001234567',
          addressLine1: 'Cra 43A # 1-50',
          city: 'Medellín',
          region: 'Antioquia',
          country: 'CO',
        },
      },
      'signature-hex',
    );

    expect(body).toEqual({
      acceptance_token: 'acc',
      accept_personal_auth: 'pers',
      amount_in_cents: 16_300_000,
      currency: 'COP',
      signature: 'signature-hex',
      customer_email: 'ana@mail.com',
      reference: 'TX-1',
      payment_method: { type: 'CARD', token: 'tok_test', installments: 3 },
      customer_data: { full_name: 'Ana Pérez', phone_number: '573001234567' },
      shipping_address: {
        address_line_1: 'Cra 43A # 1-50',
        country: 'CO',
        region: 'Antioquia',
        city: 'Medellín',
        name: 'Ana Pérez',
        phone_number: '3001234567',
      },
    });
  });

  it('should include optional address fields only when present', () => {
    const body = toChargeBody(
      {
        reference: 'TX-1',
        amountInCents: 1,
        currency: 'COP',
        customerEmail: 'a@b.co',
        customer: { fullName: 'Ana', phone: '3001234567' },
        cardToken: 't',
        installments: 1,
        acceptanceToken: 'a',
        acceptPersonalAuth: 'p',
        shipping: {
          recipientName: 'Ana',
          recipientPhone: '3001234567',
          addressLine1: 'Calle 1',
          addressLine2: 'Apto 2',
          city: 'Cali',
          region: 'Valle del Cauca',
          country: 'CO',
          postalCode: '760001',
        },
      },
      's',
    );

    expect(body.shipping_address).toMatchObject({
      address_line_2: 'Apto 2',
      postal_code: '760001',
    });
  });

  it('should summarize rejections without echoing request data', () => {
    const body = gatewayErrorBodySchema.parse(fixture('error-input-validation'));

    expect(rejectionReason(422, body)).toBe('INPUT_VALIDATION_ERROR: invalid payment_method');
    expect(
      rejectionReason(404, { error: { type: 'NOT_FOUND_ERROR', reason: 'La entidad no existe' } }),
    ).toBe('NOT_FOUND_ERROR: La entidad no existe');
    expect(rejectionReason(401, { error: {} })).toBe('HTTP 401');
    expect(rejectionReason(403, null)).toBe('HTTP 403');
  });
});
