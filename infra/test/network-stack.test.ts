import { App, Aspects } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { STAGES } from '../lib/config/stage-config';
import { NetworkStack } from '../lib/network-stack';
import { expectNoNagFindings } from './support/nag';

describe('NetworkStack', () => {
  const app = new App();
  const stack = new NetworkStack(app, 'Network', {
    config: STAGES.prod,
    env: { account: '123456789012', region: 'us-east-1' },
  });
  Aspects.of(app).add(new AwsSolutionsChecks());
  const template = Template.fromStack(stack);

  it('should create public, private with egress and isolated subnets in two AZs', () => {
    template.resourceCountIs('AWS::EC2::Subnet', 6);
    template.hasResourceProperties('AWS::EC2::Subnet', {
      Tags: Match.arrayWith([{ Key: 'aws-cdk:subnet-type', Value: 'Isolated' }]),
    });
  });

  it('should use a single t4g.nano NAT instance instead of a NAT gateway', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::Instance', 1);
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't4g.nano',
      SourceDestCheck: false,
    });
  });

  it('should only admit PostgreSQL traffic from the Lambda security group', () => {
    const lambdaSg = stack.resolve(stack.lambdaSecurityGroup.securityGroupId) as unknown;
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 5432,
      ToPort: 5432,
      SourceSecurityGroupId: lambdaSg,
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'PostgreSQL: only reachable from the Lambdas',
      SecurityGroupEgress: Match.arrayWith([Match.objectLike({ CidrIp: '255.255.255.255/32' })]),
    });
  });

  it('should never open inbound traffic to the internet', () => {
    const groups = template.findResources('AWS::EC2::SecurityGroup');
    const ingresses = template.findResources('AWS::EC2::SecurityGroupIngress');
    const inlineRules = Object.values(groups).flatMap(
      (group) =>
        (group.Properties as { SecurityGroupIngress?: { CidrIp?: string }[] })
          .SecurityGroupIngress ?? [],
    );
    const standaloneRules = Object.values(ingresses).map(
      (rule) => rule.Properties as { CidrIp?: string },
    );

    expect(
      [...inlineRules, ...standaloneRules].filter((rule) => rule.CidrIp === '0.0.0.0/0'),
    ).toEqual([]);
  });

  it('should log rejected traffic with a short retention', () => {
    template.hasResourceProperties('AWS::EC2::FlowLog', { TrafficType: 'REJECT' });
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
  });

  it('should have no unjustified cdk-nag findings', () => {
    expectNoNagFindings(stack);
  });
});
