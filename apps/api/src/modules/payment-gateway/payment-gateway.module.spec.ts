import { Test } from '@nestjs/testing';
import { fixture, json } from '../../../test/support/fake-gateway-fetch';
import { testEnv } from '../../../test/support/test-env';
import { AppConfigService } from '../../shared/infrastructure/config/app-config.service';
import { ConfigModule } from '../../shared/infrastructure/config/config.module';
import { parseEnv } from '../../shared/infrastructure/config/env.schema';
import { KernelModule } from '../../shared/infrastructure/kernel/kernel.module';
import { PAYMENT_GATEWAY, type PaymentGateway } from './domain/payment-gateway.port';
import { PaymentGatewayModule } from './payment-gateway.module';

interface MerchantBody {
  data: { presigned_acceptance: { acceptance_token: string } };
}

/** The merchant endpoint signs a new acceptance token (its own `jit`) on every call. */
const merchantWithToken = (token: string): Response => {
  const body = structuredClone(fixture('merchant')) as MerchantBody;
  body.data.presigned_acceptance.acceptance_token = token;
  return json(200, body);
};

describe('PaymentGatewayModule', () => {
  let gateway: PaymentGateway;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    let calls = 0;
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(merchantWithToken(`acceptance-${++calls}`)));
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, KernelModule, PaymentGatewayModule],
    })
      .overrideProvider(AppConfigService)
      .useValue(new AppConfigService(parseEnv(testEnv())))
      .compile();
    gateway = moduleRef.get<PaymentGateway>(PAYMENT_GATEWAY);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should ask the gateway for fresh acceptance tokens on every checkout, because they are single use', async () => {
    const first = await gateway.getAcceptanceTokens();
    const second = await gateway.getAcceptanceTokens();

    expect(first.ok && first.value.acceptanceToken).toBe('acceptance-1');
    expect(second.ok && second.value.acceptanceToken).toBe('acceptance-2');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
