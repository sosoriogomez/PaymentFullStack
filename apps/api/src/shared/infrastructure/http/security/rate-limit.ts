import { Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { AppConfigService } from '../../config/app-config.service';
import { clientIpOf, type TrackedRequest } from './client-ip';

export const RATE_LIMIT_WINDOW_MS = 60_000;
const PAYMENT_RATE_LIMIT = Symbol('PaymentRateLimit');

/** Stricter per-IP limit for routes that charge money (OWASP API6). */
export const PaymentRateLimit = () => SetMetadata(PAYMENT_RATE_LIMIT, true);

/**
 * Per client IP and route. Counters live in memory, so each Lambda instance counts on its own:
 * best-effort (I-01); API Gateway throttling is the global limit.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: AppConfigService,
  ) {
    super(options, storage, reflector);
  }

  protected override getTracker(request: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIpOf(request as unknown as TrackedRequest, this.config.app.isAws));
  }

  protected override handleRequest(request: ThrottlerRequest): Promise<boolean> {
    const payments = this.reflector.getAllAndOverride<boolean | undefined>(PAYMENT_RATE_LIMIT, [
      request.context.getHandler(),
      request.context.getClass(),
    ]);
    const limit = payments ? this.config.http.rateLimit.paymentsPerMinute : request.limit;
    return super.handleRequest({ ...request, limit });
  }
}
