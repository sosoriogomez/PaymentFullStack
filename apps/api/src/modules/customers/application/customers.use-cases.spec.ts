import { aCustomer, CUSTOMER_ID } from '../../../../test/builders/customer.builder';
import { InMemoryCustomerRepository } from '../../../../test/fakes/in-memory-customer.repository';
import { err, ok } from '../../../shared/kernel/result';
import { GetCustomer } from './get-customer.use-case';
import { RegisterCustomer } from './register-customer.use-case';

const ids = { uuid: jest.fn(() => '22222222-2222-4222-8222-222222222222') };

describe('RegisterCustomer', () => {
  it('should create a new customer with a normalized email', async () => {
    const repository = new InMemoryCustomerRepository();

    const result = await new RegisterCustomer(repository, ids).execute({
      fullName: 'Ana Pérez',
      email: 'Ana@Mail.com',
      phone: '3001234567',
    });

    expect(result.ok && result.value.created).toBe(true);
    expect(result.ok && result.value.customer.email).toBe('ana@mail.com');
    expect(result.ok && result.value.customer.id).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('should update name and phone of an existing email, keeping its id', async () => {
    const repository = new InMemoryCustomerRepository([aCustomer()]);

    const result = await new RegisterCustomer(repository, ids).execute({
      fullName: 'Ana María Pérez',
      email: 'ANA@mail.com',
      phone: '3109876543',
    });

    expect(result.ok && result.value.created).toBe(false);
    expect(result.ok && result.value.customer.id).toBe(CUSTOMER_ID);
    expect(result.ok && result.value.customer.phone).toBe('3109876543');
  });

  it.each([
    [{ fullName: 'A', email: 'ana@mail.com', phone: '3001234567' }, 'fullName'],
    [{ fullName: 'Ana Pérez', email: 'nope', phone: '3001234567' }, 'email'],
    [{ fullName: 'Ana Pérez', email: 'ana@mail.com', phone: '123' }, 'phone'],
  ])('should reject invalid data %j (%s)', async (command, field) => {
    const result = await new RegisterCustomer(new InMemoryCustomerRepository(), ids).execute(
      command,
    );

    expect(result.ok ? null : result.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field }],
    });
  });
});

describe('GetCustomer', () => {
  it('should find a customer by id', async () => {
    expect(
      await new GetCustomer(new InMemoryCustomerRepository([aCustomer()])).execute(CUSTOMER_ID),
    ).toEqual(ok(aCustomer()));
  });

  it('should report a missing customer', async () => {
    expect(await new GetCustomer(new InMemoryCustomerRepository()).execute(CUSTOMER_ID)).toEqual(
      err({ code: 'CUSTOMER_NOT_FOUND', customerId: CUSTOMER_ID }),
    );
  });
});
