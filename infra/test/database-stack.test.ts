import { App, Aspects } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { STAGES } from '../lib/config/stage-config';
import { DatabaseStack } from '../lib/database-stack';
import { NetworkStack } from '../lib/network-stack';
import { expectNoNagFindings } from './support/nag';

describe('DatabaseStack', () => {
  const app = new App();
  const env = { account: '123456789012', region: 'us-east-1' };
  const network = new NetworkStack(app, 'Network', { config: STAGES.prod, env });
  const stack = new DatabaseStack(app, 'Database', {
    config: STAGES.prod,
    env,
    vpc: network.vpc,
    securityGroup: network.databaseSecurityGroup,
  });
  Aspects.of(app).add(new AwsSolutionsChecks());
  const template = Template.fromStack(stack);

  it('should run a private, encrypted PostgreSQL 16 micro instance', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: '16',
      DBInstanceClass: 'db.t4g.micro',
      StorageEncrypted: true,
      PubliclyAccessible: false,
      MultiAZ: false,
      StorageType: 'gp3',
      AllocatedStorage: '20',
      DBName: 'checkout',
      BackupRetentionPeriod: 1,
    });
  });

  it('should reject connections without TLS', () => {
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: { 'rds.force_ssl': '1' },
    });
  });

  it('should keep a snapshot when the stack is deleted', () => {
    template.hasResource('AWS::RDS::DBInstance', {
      DeletionPolicy: 'Snapshot',
      UpdateReplacePolicy: 'Snapshot',
    });
  });

  it('should export PostgreSQL logs to a log group with bounded retention', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/rds/instance/checkout-prod-db/postgresql',
      RetentionInDays: 14,
    });
    template.resourceCountIs('Custom::LogRetention', 0);
  });

  it('should generate the credentials in Secrets Manager', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'checkout/prod/database',
    });
  });

  it('should have no unjustified cdk-nag findings', () => {
    expectNoNagFindings(stack);
  });
});
