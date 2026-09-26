import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigService } from '../config/app-config.service';
import { NoStoreInterceptor } from './no-store.interceptor';
import { OriginVerifyGuard } from './origin-verify.guard';
import { ProblemDetailsFilter } from './problem-details.filter';
import { AppThrottlerGuard, RATE_LIMIT_WINDOW_MS } from './security/rate-limit';
import { createValidationPipe } from './validation';

/** Cross-cutting HTTP behavior registered once for the whole app (and therefore for the tests). */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        { name: 'default', ttl: RATE_LIMIT_WINDOW_MS, limit: config.http.rateLimit.perMinute },
      ],
    }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    // Order matters: only requests that came through the CDN are counted.
    { provide: APP_GUARD, useClass: OriginVerifyGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
})
export class HttpInfrastructureModule {}
