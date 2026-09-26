import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';

export const ORIGIN_VERIFY_HEADER = 'x-origin-verify';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Constant-time comparison (hashing first makes both buffers the same length). */
const sameSecret = (received: string, expected: string): boolean =>
  timingSafeEqual(digest(received), digest(expected));

/**
 * On AWS only CloudFront may call the API: it adds a secret header (C-06). Direct calls to the
 * API Gateway URL would skip the CDN security headers, so they get 403. Locally the guard is off.
 */
@Injectable()
export class OriginVerifyGuard implements CanActivate {
  private readonly secret: string | undefined;

  constructor(config: AppConfigService) {
    this.secret = config.http.originVerifySecret;
    if (config.app.isAws && !this.secret) {
      throw new Error('ORIGIN_VERIFY_SECRET is required to serve HTTP on AWS');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) return true;
    const received = context.switchToHttp().getRequest<Request>().headers[ORIGIN_VERIFY_HEADER];
    if (typeof received === 'string' && sameSecret(received, this.secret)) return true;
    throw new ForbiddenException('Requests must come through the CDN');
  }
}
