import { type Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { resourceName, type StageConfig } from '../config/stage-config';

export interface ApiLambdaProps {
  readonly config: StageConfig;
  /** Resource suffix: the function is named `checkout-<stage>-<name>`. */
  readonly name: string;
  /** `<file>.<export>` inside the bundle, e.g. `lambda.handler`. */
  readonly handler: string;
  /** Injected: `Code.fromAsset(dist-lambda)` in the app, inline code in tests. */
  readonly code: lambda.Code;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeout: Duration;
  readonly memorySize: number;
  readonly description: string;
  /** C-02: only set when the account quota allows it. */
  readonly reservedConcurrency?: number | undefined;
}

/** Node 24 on Graviton inside the VPC, with its own log group (bounded retention, no custom resource). */
export class ApiLambda extends Construct {
  readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiLambdaProps) {
    super(scope, id);
    const functionName = resourceName(props.config, props.name);
    const logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: props.config.logRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.function = new lambda.Function(this, 'Function', {
      functionName,
      description: props.description,
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      handler: props.handler,
      code: props.code,
      memorySize: props.memorySize,
      timeout: props.timeout,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.securityGroup],
      logGroup,
      environment: { NODE_OPTIONS: '--enable-source-maps', ...props.environment },
      ...(props.reservedConcurrency === undefined
        ? {}
        : { reservedConcurrentExecutions: props.reservedConcurrency }),
    });

    NagSuppressions.addResourceSuppressions(
      this.function,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWS managed basic execution and VPC access policies: CloudWatch Logs and ENI management only.',
        },
      ],
      true,
    );
  }
}
