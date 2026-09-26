import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import { NagSuppressions } from 'cdk-nag';
import { type Construct } from 'constructs';
import { PROJECT, resourceName, type StageConfig } from './config/stage-config';

export interface DatabaseStackProps extends StackProps {
  readonly config: StageConfig;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
}

const ENGINE = rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 });

/** PostgreSQL 16 in isolated subnets: encrypted, private, TLS only, credentials in Secrets Manager. */
export class DatabaseStack extends Stack {
  readonly instance: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);
    const { config } = props;

    const parameterGroup = new rds.ParameterGroup(this, 'Parameters', {
      engine: ENGINE,
      description: 'Checkout PostgreSQL: TLS is mandatory',
      parameters: { 'rds.force_ssl': '1' },
    });

    const instanceIdentifier = resourceName(config, 'db');
    // Owning the log group (instead of cloudwatchLogsRetention) avoids a log-retention custom resource.
    const logGroup = new logs.LogGroup(this, 'PostgresLogs', {
      logGroupName: `/aws/rds/instance/${instanceIdentifier}/postgresql`,
      retention: config.logRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.instance = new rds.DatabaseInstance(this, 'Database', {
      instanceIdentifier,
      engine: ENGINE,
      instanceType: new ec2.InstanceType(config.database.instanceType),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.securityGroup],
      credentials: rds.Credentials.fromGeneratedSecret('app_admin', {
        secretName: `${PROJECT}/${config.stage}/database`,
      }),
      databaseName: config.database.databaseName,
      allocatedStorage: config.database.allocatedStorageGb,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      publiclyAccessible: false,
      multiAz: false,
      parameterGroup,
      backupRetention: config.database.backupRetention,
      deletionProtection: false,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      autoMinorVersionUpgrade: true,
      enablePerformanceInsights: false,
      cloudwatchLogsExports: ['postgresql'],
    });
    this.instance.node.addDependency(logGroup);

    this.justifyCostTradeOffs();
  }

  private justifyCostTradeOffs(): void {
    NagSuppressions.addResourceSuppressions(
      this.instance,
      [
        {
          id: 'AwsSolutions-RDS3',
          reason: 'Single-AZ on purpose: evaluation environment on a free-tier budget.',
        },
        {
          id: 'AwsSolutions-RDS10',
          reason:
            'Deletion protection is off so cdk destroy can remove it after the evaluation (a final snapshot is kept).',
        },
        {
          id: 'AwsSolutions-RDS11',
          reason:
            'The default port is fine: the instance is not publicly accessible and only the Lambda security group reaches it.',
        },
        {
          id: 'AwsSolutions-RDS6',
          reason:
            'Password authentication with a generated secret in Secrets Manager; IAM auth would add token refresh to every Lambda connection.',
        },
        {
          id: 'AwsSolutions-SMG4',
          reason:
            'Automatic rotation is out of scope for the evaluation period; the secret is generated and never leaves AWS.',
        },
      ],
      true,
    );
  }
}
