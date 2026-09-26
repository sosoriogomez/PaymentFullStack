import { type Type } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap/configure-app';
import { AppConfigService } from '../../src/shared/infrastructure/config/app-config.service';
import { parseEnv } from '../../src/shared/infrastructure/config/env.schema';
import { createTestDatabase } from './database/test-database';
import { testEnv } from './test-env';

export interface TestAppOptions {
  readonly env?: Record<string, string | undefined>;
  /** Extra controllers, e.g. probes that exercise cross-cutting behavior. */
  readonly controllers?: Type[];
  readonly customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly dataSource: DataSource;
  readonly api: () => ReturnType<typeof request>;
  close(): Promise<void>;
}

/**
 * The real AppModule on its own migrated database, with test configuration.
 * `customize` swaps ports for fakes (e.g. the payment gateway).
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const database = await createTestDatabase();
  const env = testEnv({ DATABASE_URL: database.url, ...options.env });
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(AppConfigService)
    .useValue(new AppConfigService(parseEnv(env)));
  const moduleRef = await (options.customize?.(builder) ?? builder).compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>({ logger: false }),
  );
  await app.init();
  return {
    app,
    dataSource: app.get(DataSource),
    api: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
      await database.drop();
    },
  };
}
