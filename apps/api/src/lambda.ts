import 'reflect-metadata';
import serverlessExpress from '@codegenie/serverless-express';
import { type Context, type Handler } from 'aws-lambda';
import { awsSecretSources } from './bootstrap/aws-secret-sources';
import { createApp } from './bootstrap/create-app';
import { loadSecretsIntoEnv } from './bootstrap/secrets-loader';

type HttpHandler = (event: unknown, context: Context) => Promise<unknown>;

let handlerPromise: Promise<HttpHandler> | undefined;

/** Built once per Lambda container (cold start) and reused by every invocation. */
async function createHttpHandler(): Promise<HttpHandler> {
  await loadSecretsIntoEnv(process.env, awsSecretSources());
  const app = await createApp();
  await app.init();
  const proxy = serverlessExpress({ app: app.getHttpAdapter().getInstance() }) as Handler;
  return async (event, context) => (await proxy(event, context, () => undefined)) as unknown;
}

/** API Gateway (HTTP API, payload v2) → NestJS. Async only: Node 24 has no callback handlers. */
export const handler = async (event: unknown, context: Context): Promise<unknown> => {
  handlerPromise ??= createHttpHandler().catch((error: unknown) => {
    handlerPromise = undefined; // let the next invocation retry a failed cold start
    throw error;
  });
  return (await handlerPromise)(event, context);
};
