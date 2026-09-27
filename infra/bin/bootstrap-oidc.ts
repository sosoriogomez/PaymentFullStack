#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { resourceName, stageConfig } from '../lib/config/stage-config';
import { applyProjectAspects } from '../lib/config/app-aspects';

/**
 * One-off app: `npx cdk deploy -a "npx tsx bin/bootstrap-oidc.ts" -c repository=<repository>`.
 * Run it once, after `cdk bootstrap`, with administrator credentials.
 *
 * `repository` is written as GitHub puts it in the token subject: `<owner>@<owner-id>/<repo>@<repo-id>`
 * for repositories created after 2026-07-15 (immutable subject, I-23), `<owner>/<repo>` for older ones.
 */
const REPOSITORY_FORMAT = /^[\w.-]+@\d+\/[\w.-]+@\d+$|^[\w.-]+\/[\w.-]+$/;

const app = new App();
const config = stageConfig(app.node.tryGetContext('stage') ?? 'prod');
const repository: unknown = app.node.tryGetContext('repository');
if (typeof repository !== 'string' || !REPOSITORY_FORMAT.test(repository)) {
  throw new Error(
    'Pass the GitHub repository as context: -c repository=<owner>@<owner-id>/<repo>@<repo-id> ' +
      '(or <owner>/<repo> for repositories created before 2026-07-15). See infra/README.md.',
  );
}

new GithubOidcStack(app, resourceName(config, 'github-oidc'), {
  repository,
  branch: 'main',
  stage: config.stage,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region },
});
applyProjectAspects(app, config);
