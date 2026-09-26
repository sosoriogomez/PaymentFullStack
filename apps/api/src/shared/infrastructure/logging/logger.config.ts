import { type IncomingMessage } from 'node:http';
import { type Params } from 'nestjs-pino';
import { type AppConfigService } from '../config/app-config.service';
import { resolveRequestId } from '../http/request-id';

/** Defense in depth: request logs never include bodies, and these paths are masked anywhere. */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-origin-verify"]',
  '*.cardToken',
  '*.acceptanceToken',
  '*.acceptPersonalAuth',
  '*.email',
  '*.phone',
  '*.phoneNumber',
  '*.recipientPhone',
] as const;

const isHealthCheck = (req: IncomingMessage): boolean => (req.url ?? '').includes('/health');

export function loggerParams(config: AppConfigService): Params {
  return {
    pinoHttp: {
      level: config.app.logLevel,
      genReqId: (req, res) => resolveRequestId(req, res),
      redact: { paths: [...REDACTED_PATHS], censor: '[REDACTED]' },
      autoLogging: { ignore: isHealthCheck },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
