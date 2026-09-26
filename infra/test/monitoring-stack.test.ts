import { App, Aspects } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ApiStack } from '../lib/api-stack';
import { STAGES } from '../lib/config/stage-config';
import { DatabaseStack } from '../lib/database-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { NetworkStack } from '../lib/network-stack';
import { expectNoNagFindings } from './support/nag';

const buildMonitoring = () => {
  const app = new App();
  const config = STAGES.prod;
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
    code: lambda.Code.fromInline('exports.handler = async () => ({});'),
  });
  const monitoring = new MonitoringStack(app, 'Monitoring', {
    config,
    env,
    alarmEmail: 'alarms@example.com',
    apiFunction: api.apiFunction,
    reconcileFunction: api.reconcileFunction,
    httpApi: api.httpApi,
    database: database.instance,
    natInstanceIds: network.natInstanceIds,
  });
  Aspects.of(app).add(new AwsSolutionsChecks());
  return { monitoring, template: Template.fromStack(monitoring) };
};

describe('MonitoringStack', () => {
  const { monitoring, template } = buildMonitoring();

  it('should email every alarm through an SNS topic that requires TLS', () => {
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alarms@example.com',
    });
    template.hasResourceProperties('AWS::SNS::TopicPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('should create the alarms of the spec, quiet when there is no data', () => {
    const alarms = template.findResources('AWS::CloudWatch::Alarm');

    expect(Object.keys(alarms)).toHaveLength(9);
    Object.values(alarms).forEach((alarm) => {
      expect(alarm).toMatchObject({
        Properties: {
          TreatMissingData: 'notBreaching',
          AlarmActions: [expect.anything()],
          OKActions: [expect.anything()],
        },
      });
    });
    expect(monitoring.alarms.map((alarm) => alarm.node.id)).toEqual([
      'ApiErrors',
      'ApiThrottles',
      'ApiServerErrorRate',
      'ApiLatencyP95',
      'ReconcileErrors',
      'DatabaseCpu',
      'DatabaseFreeStorage',
      'NatStatusCheck1',
      'BusinessAlerts',
    ]);
  });

  it('should watch the right metrics and thresholds', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'checkout-prod-api-latency-p95',
      ExtendedStatistic: 'p95',
      Threshold: 5000,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'checkout-prod-reconcile-errors',
      MetricName: 'Errors',
      Period: 900,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'checkout-prod-api-server-error-rate',
      Metrics: Match.arrayWith([
        Match.objectLike({ Expression: '100 * errors / IF(requests > 0, requests, 1)' }),
      ]),
      Threshold: 1,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'checkout-prod-database-free-storage',
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 2 * 1024 ** 3,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'StatusCheckFailed',
      Namespace: 'AWS/EC2',
    });
  });

  it('should turn logged business anomalies into an alarm', () => {
    template.resourceCountIs('AWS::Logs::MetricFilter', 2);
    template.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: '?"AMOUNT_MISMATCH" ?"BACKORDERED" ?"RECONCILIATION_FAILED"',
      MetricTransformations: [
        Match.objectLike({ MetricNamespace: 'checkout', MetricName: 'BusinessAlerts' }),
      ],
    });
  });

  it('should alert at 50, 80 and 100 % of a USD 10 monthly budget', () => {
    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: 10, Unit: 'USD' },
      },
      NotificationsWithSubscribers: [50, 80, 100].map((threshold) =>
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: threshold, ThresholdType: 'PERCENTAGE' }),
          Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'alarms@example.com' }],
        }),
      ),
    });
  });

  it('should publish an overview dashboard', () => {
    template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
      DashboardName: 'checkout-prod-overview',
    });
  });

  it('should have no unjustified cdk-nag findings', () => {
    expectNoNagFindings(monitoring);
  });
});
