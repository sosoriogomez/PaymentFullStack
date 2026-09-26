import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module';
import { configureApp } from './configure-app';

/**
 * `abortOnError: false` makes bootstrap errors (e.g. an invalid environment) reject instead of
 * calling `process.exit`, so the caller (server, Lambda handler, tests) decides what to do.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  return configureApp(app);
}
