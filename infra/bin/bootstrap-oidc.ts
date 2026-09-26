#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { resourceName, stageConfig } from '../lib/config/stage-config';
import { applyProjectAspects } from '../lib/config/app-aspects';

/**
 * One-off app: `npx cdk deploy -a "npx tsx bin/bootstrap-oidc.ts" -c repository=<owner>/<repo>`.
 * Run it once, after `cdk bootstrap`, with administrator credentials.
 */
const app = new App();
const config = stageConfig(app.node.tryGetContext('stage') ?? 'prod');
const repository: unknown = app.node.tryGetContext('repository');
if (typeof repository !== 'string' || !repository.includes('/')) {
  throw new Error('Pass the GitHub repository as context: -c repository=<owner>/<repo>');
}

new GithubOidcStack(app, resourceName(config, 'github-oidc'), {
  repository,
  branch: 'main',
  stage: config.stage,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region },
});
applyProjectAspects(app, config);
