#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { applyProjectAspects } from '../lib/config/app-aspects';
import { requiredContext } from '../lib/config/context';
import { lambdaBundle } from '../lib/config/lambda-code';
import { resourceName, stageConfig } from '../lib/config/stage-config';
import { DatabaseStack } from '../lib/database-stack';
import { NetworkStack } from '../lib/network-stack';
import { WebStack } from '../lib/web-stack';

const app = new App();
const config = stageConfig(app.node.tryGetContext('stage'));
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region };
// Host of the payment gateway for the CSP: comes from a GitHub variable, never from the code.
const paymentGatewayHost = requiredContext(app, 'pgHost');

const network = new NetworkStack(app, resourceName(config, 'network'), { config, env });
const database = new DatabaseStack(app, resourceName(config, 'database'), {
  config,
  env,
  vpc: network.vpc,
  securityGroup: network.databaseSecurityGroup,
});
const api = new ApiStack(app, resourceName(config, 'api'), {
  config,
  env,
  vpc: network.vpc,
  lambdaSecurityGroup: network.lambdaSecurityGroup,
  database: database.instance,
  code: lambdaBundle(),
});
new WebStack(app, resourceName(config, 'web'), {
  config,
  env,
  httpApi: api.httpApi,
  originVerifySecret: api.originVerifySecret,
  paymentGatewayHost,
});

applyProjectAspects(app, config);
