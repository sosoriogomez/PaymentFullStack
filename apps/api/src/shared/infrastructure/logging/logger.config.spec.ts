import { type IncomingMessage } from 'node:http';
import { type Options } from 'pino-http';
import { testEnv } from '../../../../test/support/test-env';
import { AppConfigService } from '../config/app-config.service';
import { parseEnv } from '../config/env.schema';
import { loggerParams, REDACTED_PATHS } from './logger.config';

describe('loggerParams', () => {
  const params = loggerParams(new AppConfigService(parseEnv(testEnv({ LOG_LEVEL: 'warn' }))));
  const http = params.pinoHttp as Options & {
    autoLogging: { ignore: (req: IncomingMessage) => boolean };
    serializers: { req: (req: object) => object; res: (res: object) => object };
  };

  it('should use the configured level', () => {
    expect(http.level).toBe('warn');
  });

  it('should redact credentials and personal data', () => {
    expect(http.redact).toEqual({ paths: [...REDACTED_PATHS], censor: '[REDACTED]' });
    expect(REDACTED_PATHS).toEqual(
      expect.arrayContaining(['req.headers.authorization', '*.cardToken', '*.email', '*.phone']),
    );
  });

  it('should not log health checks', () => {
    expect(http.autoLogging.ignore({ url: '/api/v1/health' } as IncomingMessage)).toBe(true);
    expect(http.autoLogging.ignore({ url: '/api/v1/products' } as IncomingMessage)).toBe(false);
    expect(http.autoLogging.ignore({} as IncomingMessage)).toBe(false);
  });

  it('should log only the method, url and id of requests (never headers or bodies)', () => {
    const req = {
      id: 'r1',
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'x' },
      body: {},
    };

    expect(http.serializers.req(req)).toEqual({
      id: 'r1',
      method: 'POST',
      url: '/api/v1/transactions',
    });
    expect(http.serializers.res({ statusCode: 201, headers: {} })).toEqual({ statusCode: 201 });
  });
});
