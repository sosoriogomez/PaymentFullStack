import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  readonly status: 'ok';
}

@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
