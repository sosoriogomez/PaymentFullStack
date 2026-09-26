#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { applyProjectAspects } from '../lib/config/app-aspects';
import { resourceName, stageConfig } from '../lib/config/stage-config';
import { DatabaseStack } from '../lib/database-stack';
import { NetworkStack } from '../lib/network-stack';

const app = new App();
const config = stageConfig(app.node.tryGetContext('stage'));
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: config.region };

const network = new NetworkStack(app, resourceName(config, 'network'), { config, env });
new DatabaseStack(app, resourceName(config, 'database'), {
  config,
  env,
  vpc: network.vpc,
  securityGroup: network.databaseSecurityGroup,
});

applyProjectAspects(app, config);
