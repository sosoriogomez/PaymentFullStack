import { App, Aspects } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ApiStack } from '../lib/api-stack';
import { STAGES, type StageConfig } from '../lib/config/stage-config';
import { DatabaseStack } from '../lib/database-stack';
import { NetworkStack } from '../lib/network-stack';
import { expectNoNagFindings } from './support/nag';

const buildStacks = (config: StageConfig = STAGES.prod) => {
  const app = new App();
  const env = { account: '123456789012', region: 'us-east-1' };
  const network = new NetworkStack(app, 'Network', { config, env });
  const database = new DatabaseStack(app, 'Database', {
    config,
    env,
    vpc: network.vpc,
    securityGroup: network.databaseSecurityGroup,
  });
  const api = new ApiStack(app, 'Api', {
    config,
    env,
    vpc: network.vpc,
    lambdaSecurityGroup: network.lambdaSecurityGroup,
    database: database.instance,
    code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
  });
  Aspects.of(app).add(new AwsSolutionsChecks());
  return { api, template: Template.fromStack(api) };
};

describe('ApiStack', () => {
  const { api, template } = buildStacks();

  it('should run the HTTP and migrate handlers on Node 24 arm64 inside the VPC', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'checkout-prod-api',
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Handler: 'lambda.handler',
      MemorySize: 1024,
      Timeout: 20,
      VpcConfig: Match.objectLike({ SecurityGroupIds: Match.anyValue() }),
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'checkout-prod-migrate',
      Handler: 'migrate.handler',
      Timeout: 300,
    });
  });

  it('should not reserve concurrency by default (C-02)', () => {
    template.resourcePropertiesCountIs(
      'AWS::Lambda::Function',
      { ReservedConcurrentExecutions: Match.anyValue() },
      0,
    );
  });

  it('should reserve concurrency only when the stage asks for it', () => {
    const { template: reserved } = buildStacks({
      ...STAGES.prod,
      api: { ...STAGES.prod.api, reservedConcurrency: 5 },
    });

    reserved.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'checkout-prod-api',
      ReservedConcurrentExecutions: 5,
    });
  });

  it('should configure the app for AWS without putting secrets in the environment', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'checkout-prod-api',
      Environment: {
        Variables: Match.objectLike({
          APP_ENV: 'aws',
          SSM_PARAMETER_PREFIX: '/checkout/prod',
          DB_SSL_CA_PATH: '/var/task/certs/global-bundle.pem',
          DB_SECRET_ARN: Match.anyValue(),
          ORIGIN_VERIFY_SECRET_ARN: Match.anyValue(),
        }),
      },
    });
    const variables = JSON.stringify(template.findResources('AWS::Lambda::Function'));
    expect(variables).not.toMatch(/PG_PRIVATE_KEY|DB_PASSWORD/);
  });

  it('should give only the HTTP function access to the origin verify secret', () => {
    const migrateEnv = template.findResources('AWS::Lambda::Function', {
      Properties: { FunctionName: 'checkout-prod-migrate' },
    });
    expect(JSON.stringify(migrateEnv)).not.toContain('ORIGIN_VERIFY_SECRET_ARN');
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'checkout/prod/origin-verify',
      GenerateSecretString: { PasswordLength: 48, ExcludePunctuation: true },
    });
  });

  it('should throttle the HTTP API default stage and log access in JSON', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: { ThrottlingRateLimit: 25, ThrottlingBurstLimit: 50 },
      AccessLogSettings: Match.objectLike({ Format: Match.stringLikeRegexp('requestId') }),
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /{proxy+}' });
  });

  it('should scope SSM reads to the project parameters', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ssm:GetParameters',
            Resource: {
              'Fn::Join': [
                '',
                Match.arrayWith([Match.stringLikeRegexp(':parameter/checkout/prod/\\*$')]),
              ],
            },
          }),
        ]),
      },
    });
  });

  it('should export the endpoint and function names for the pipeline', () => {
    template.hasOutput('ApiEndpoint', {});
    template.hasOutput('MigrateFunctionName', {});
    expect(api.workerEnvironment.APP_ENV).toBe('aws');
  });

  it('should have no unjustified cdk-nag findings', () => {
    expectNoNagFindings(api);
  });
});
