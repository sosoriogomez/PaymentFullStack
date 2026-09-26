import { type INestApplication, VersioningType } from '@nestjs/common';

export const API_PREFIX = 'api';

/** HTTP settings shared by the local server, the Lambda handler and the e2e tests. */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();
  return app;
}
