import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { type Construct } from 'constructs';
import { PROJECT, parameterPrefix, resourceName, type StageConfig } from './config/stage-config';
import { ApiLambda } from './constructs/api-lambda';

export interface ApiStackProps extends StackProps {
  readonly config: StageConfig;
  readonly vpc: ec2.IVpc;
  readonly lambdaSecurityGroup: ec2.ISecurityGroup;
  readonly database: rds.DatabaseInstance;
  readonly code: lambda.Code;
}

/** Path of the RDS CA bundle inside the Lambda package (copied by the API bundle script). */
const RDS_CA_BUNDLE = '/var/task/certs/global-bundle.pem';

const ACCESS_LOG_FORMAT = AccessLogFormat.custom(
  JSON.stringify({
    requestId: '$context.requestId',
    ip: '$context.identity.sourceIp',
    method: '$context.httpMethod',
    path: '$context.path',
    status: '$context.status',
    latencyMs: '$context.responseLatency',
    integrationError: '$context.integrationErrorMessage',
  }),
);

/** Checkout API: Lambdas (HTTP and migrations) behind an HTTP API that only CloudFront should call. */
export class ApiStack extends Stack {
  readonly httpApi: apigwv2.HttpApi;
  readonly apiFunction: lambda.Function;
  readonly migrateFunction: lambda.Function;
  readonly originVerifySecret: secretsmanager.Secret;
  readonly workerEnvironment: Readonly<Record<string, string>>;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config } = props;

    // Shared with CloudFront as a custom header; generated here, never typed by a human (C-06).
    this.originVerifySecret = new secretsmanager.Secret(this, 'OriginVerifySecret', {
      secretName: `${PROJECT}/${config.stage}/origin-verify`,
      description: 'Value of the X-Origin-Verify header that CloudFront adds to API requests',
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    this.workerEnvironment = this.environmentFor(props);
    this.apiFunction = this.createFunction(props, 'ApiLambda', 'api', 'lambda.handler', {
      description: 'Checkout HTTP API (NestJS)',
      environment: {
        ...this.workerEnvironment,
        ORIGIN_VERIFY_SECRET_ARN: this.originVerifySecret.secretArn,
      },
      reservedConcurrency: config.api.reservedConcurrency,
    }).function;
    this.migrateFunction = this.createFunction(
      props,
      'MigrateLambda',
      'migrate',
      'migrate.handler',
      {
        description:
          'Runs database migrations and the catalog seed (invoked by the deploy pipeline)',
        environment: this.workerEnvironment,
        timeout: Duration.minutes(5),
      },
    ).function;
    this.originVerifySecret.grantRead(this.apiFunction);

    this.httpApi = this.createHttpApi(config);
    this.outputs();
    this.justifyFindings();
  }

  /** Grants the SSM read and database secret read that every checkout Lambda needs. */
  grantRuntimeAccess(
    fn: lambda.IFunction,
    database: rds.DatabaseInstance,
    config: StageConfig,
  ): void {
    database.secret?.grantRead(fn);
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameters'],
        resources: [
          Stack.of(this).formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: `${PROJECT}/${config.stage}/*`,
          }),
        ],
      }),
    );
  }

  private environmentFor(props: ApiStackProps): Record<string, string> {
    const { config, database } = props;
    return {
      NODE_ENV: 'production',
      APP_ENV: 'aws',
      LOG_LEVEL: 'info',
      SSM_PARAMETER_PREFIX: parameterPrefix(config),
      DB_SECRET_ARN: database.secret?.secretArn ?? '',
      DB_NAME: config.database.databaseName,
      DB_SSL_CA_PATH: RDS_CA_BUNDLE,
      DB_POOL_MAX: String(config.database.poolMax),
      BASE_FEE_IN_CENTS: String(config.api.baseFeeInCents),
      DELIVERY_FEE_IN_CENTS: String(config.api.deliveryFeeInCents),
    };
  }

  private createFunction(
    props: ApiStackProps,
    id: string,
    name: string,
    handler: string,
    options: {
      description: string;
      environment: Readonly<Record<string, string>>;
      timeout?: Duration;
      reservedConcurrency?: number | undefined;
    },
  ): ApiLambda {
    const lambdaConstruct = new ApiLambda(this, id, {
      config: props.config,
      name,
      handler,
      code: props.code,
      vpc: props.vpc,
      securityGroup: props.lambdaSecurityGroup,
      environment: options.environment,
      timeout: options.timeout ?? props.config.api.timeout,
      memorySize: props.config.api.memoryMb,
      description: options.description,
      reservedConcurrency: options.reservedConcurrency,
    });
    this.grantRuntimeAccess(lambdaConstruct.function, props.database, props.config);
    return lambdaConstruct;
  }

  private createHttpApi(config: StageConfig): apigwv2.HttpApi {
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: resourceName(config, 'http-api'),
      description: 'Checkout API (reachable through CloudFront only: X-Origin-Verify)',
      createDefaultStage: false,
    });
    const accessLogs = new logs.LogGroup(this, 'AccessLogs', {
      retention: config.logRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    new apigwv2.HttpStage(this, 'DefaultStage', {
      httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: {
        rateLimit: config.api.throttle.rateLimit,
        burstLimit: config.api.throttle.burstLimit,
      },
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(accessLogs),
        format: ACCESS_LOG_FORMAT,
      },
    });
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigwv2.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', this.apiFunction),
    });
    return httpApi;
  }

  private outputs(): void {
    new CfnOutput(this, 'ApiEndpoint', { value: this.httpApi.apiEndpoint });
    new CfnOutput(this, 'ApiFunctionName', { value: this.apiFunction.functionName });
    new CfnOutput(this, 'MigrateFunctionName', { value: this.migrateFunction.functionName });
  }

  private justifyFindings(): void {
    NagSuppressions.addResourceSuppressions(this.originVerifySecret, [
      {
        id: 'AwsSolutions-SMG4',
        reason:
          'Rotating it means a new value and a redeploy of CloudFront and the API; done manually.',
      },
    ]);
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-APIG4',
        reason:
          'Public guest checkout without users; the API only trusts CloudFront (X-Origin-Verify) and is throttled.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'ssm:GetParameters is scoped to the /checkout/<stage>/* prefix of this project.',
      },
    ]);
  }
}
