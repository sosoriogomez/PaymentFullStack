import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { NoStoreInterceptor } from './no-store.interceptor';
import { OriginVerifyGuard } from './origin-verify.guard';
import { ProblemDetailsFilter } from './problem-details.filter';
import { createValidationPipe } from './validation';

/** Cross-cutting HTTP behavior registered once for the whole app (and therefore for the tests). */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_GUARD, useClass: OriginVerifyGuard },
  ],
})
export class HttpInfrastructureModule {}
