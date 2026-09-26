import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { NagSuppressions } from 'cdk-nag';
import { type Construct } from 'constructs';
import { resourceName, type StageConfig } from './config/stage-config';

export interface NetworkStackProps extends StackProps {
  readonly config: StageConfig;
}

const POSTGRES_PORT = 5432;
const VPC_CIDR = '10.40.0.0/16';

/**
 * VPC in two AZs: public subnets (NAT), private subnets with egress (Lambdas, which reach the
 * payment gateway through the NAT) and isolated subnets (RDS, never reachable from the internet).
 */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly lambdaSecurityGroup: ec2.SecurityGroup;
  readonly databaseSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { config } = props;

    // NAT instance instead of NAT Gateway: ~USD 3/month instead of ~USD 32 (ADR-004).
    const nat = ec2.NatProvider.instanceV2({
      instanceType: new ec2.InstanceType('t4g.nano'),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
      associatePublicIpAddress: true,
    });

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: resourceName(config, 'vpc'),
      ipAddresses: ec2.IpAddresses.cidr(VPC_CIDR),
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: nat,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      flowLogs: {
        rejected: {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(
            new logs.LogGroup(this, 'FlowLogs', {
              retention: logs.RetentionDays.ONE_WEEK,
              removalPolicy: RemovalPolicy.DESTROY,
            }),
          ),
          trafficType: ec2.FlowLogTrafficType.REJECT,
        },
      },
    });
    // The NAT only forwards traffic that starts inside the VPC.
    nat.connections.allowFrom(
      ec2.Peer.ipv4(VPC_CIDR),
      ec2.Port.allTraffic(),
      'Traffic from the VPC',
    );

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      description: 'Lambdas of the checkout API: no inbound traffic',
      allowAllOutbound: true,
    });
    this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSg', {
      vpc: this.vpc,
      description: 'PostgreSQL: only reachable from the Lambdas',
      allowAllOutbound: false,
    });
    this.databaseSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(POSTGRES_PORT),
      'PostgreSQL from the checkout Lambdas',
    );

    this.suppressNatFindings();
  }

  private suppressNatFindings(): void {
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-EC28',
        reason: 'Detailed monitoring on the t4g.nano NAT instance is not worth its cost here.',
      },
      {
        id: 'AwsSolutions-EC29',
        reason:
          'The NAT instance is replaceable infrastructure; termination protection would block cdk destroy.',
      },
      {
        id: 'AwsSolutions-EC26',
        reason:
          'The NAT instance only forwards packets: its root volume stores no application or customer data.',
      },
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'The NAT instance role uses the AWS managed SSM policy so it can be administered without SSH.',
      },
    ]);
  }
}
