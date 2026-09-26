import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface HealthStatus {
  readonly status: 'ok';
  readonly database: 'up';
}

/** Liveness plus a database ping, used by the post-deploy smoke test. */
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check(): Promise<HealthStatus> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok', database: 'up' };
  }
}
