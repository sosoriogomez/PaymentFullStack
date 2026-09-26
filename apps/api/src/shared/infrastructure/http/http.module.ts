import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ProblemDetailsFilter } from './problem-details.filter';
import { createValidationPipe } from './validation';

/** Cross-cutting HTTP behavior registered once for the whole app (and therefore for the tests). */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class HttpInfrastructureModule {}
