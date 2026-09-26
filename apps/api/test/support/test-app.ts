import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap/configure-app';
import { AppConfigService } from '../../src/shared/infrastructure/config/app-config.service';
import { parseEnv } from '../../src/shared/infrastructure/config/env.schema';
import { testEnv } from './test-env';

export interface TestAppOptions {
  readonly env?: Record<string, string | undefined>;
  readonly customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Builds the real AppModule with test configuration; `customize` swaps ports for fakes. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AppConfigService)
    .useValue(new AppConfigService(parseEnv(testEnv(options.env))));
  const moduleRef = await (options.customize?.(builder) ?? builder).compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>({ logger: false }),
  );
  await app.init();
  return app;
}
