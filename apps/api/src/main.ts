import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { AppConfigService } from './shared/infrastructure/config/app-config.service';
import { createApp } from './bootstrap/create-app';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const app = await createApp();
  await app.listen(app.get(AppConfigService).app.port);
}

void bootstrap();
