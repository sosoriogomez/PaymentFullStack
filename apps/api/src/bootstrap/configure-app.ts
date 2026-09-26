import { VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { AppConfigService } from '../shared/infrastructure/config/app-config.service';
import { DOCS_PATH, setupOpenApi } from './openapi';

export const API_PREFIX = 'api';
/** Every JSON body is small in this API (OWASP API4). */
export const BODY_LIMIT = '16kb';
/** Gateway events carry the whole transaction: a little more room, on that route only. */
export const EVENTS_BODY_LIMIT = '32kb';
const ONE_YEAR_SECONDS = 31_536_000;
const CORS_MAX_AGE_SECONDS = 600;

const headersWith = (directives: Record<string, string[]>) =>
  helmet({
    contentSecurityPolicy: { useDefaults: false, directives },
    referrerPolicy: { policy: 'no-referrer' },
    // No `preload`: *.cloudfront.net is not a domain we own (I-12).
    strictTransportSecurity: { maxAge: ONE_YEAR_SECONDS, includeSubDomains: true },
    xFrameOptions: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });

/** A JSON API renders nothing: no sources at all, never framed, no referrer (OWASP API8). */
const apiHeaders = headersWith({ defaultSrc: ["'none'"], frameAncestors: ["'none'"] });

/** Swagger UI: its own scripts and inline styles, same origin only (as the CDN docs policy). */
const docsHeaders = headersWith({
  defaultSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  styleSrc: ["'self'", "'unsafe-inline'"],
  scriptSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
});

const securityHeaders = (request: Request, response: Response, next: NextFunction): void => {
  const headers = request.path.startsWith(`/${DOCS_PATH}`) ? docsHeaders : apiHeaders;
  headers(request, response, next);
};

/**
 * HTTP settings shared by the local server, the Lambda handler and the e2e tests. Must run before
 * `init()`: the body parsers registered here replace Nest's defaults (100 kb).
 */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  const { http } = app.get(AppConfigService);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // On AWS the SPA and the API share the CloudFront origin, so the allowlist stays empty.
  app.enableCors({
    origin: http.corsAllowedOrigins.length > 0 ? [...http.corsAllowedOrigins] : false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['Location', 'Idempotent-Replayed', 'X-Request-Id', 'Retry-After'],
    maxAge: CORS_MAX_AGE_SECONDS,
  });
  app.use(`/${API_PREFIX}/v1/payment-events`, json({ limit: EVENTS_BODY_LIMIT }));
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: false });
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();
  setupOpenApi(app);
  return app;
}
