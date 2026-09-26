import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as rds from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { NagSuppressions } from 'cdk-nag';
import { type Construct } from 'constructs';
import { PROJECT, resourceName, type StageConfig } from './config/stage-config';

export interface MonitoringStackProps extends StackProps {
  readonly config: StageConfig;
  readonly alarmEmail: string;
  readonly apiFunction: lambda.Function;
  readonly reconcileFunction: lambda.Function;
  readonly httpApi: apigwv2.IHttpApi;
  readonly database: rds.IDatabaseInstance;
  readonly natInstanceIds: readonly string[];
}

const FIVE_MINUTES = Duration.minutes(5);
const API_P95_LIMIT_MS = 5000;
const API_5XX_LIMIT_PERCENT = 1;
const RDS_CPU_LIMIT_PERCENT = 80;
const RDS_FREE_STORAGE_LIMIT_BYTES = 2 * 1024 ** 3;
const BUDGET_THRESHOLDS_PERCENT = [50, 80, 100] as const;

/** Events the API logs through its AlertLog port: each one needs a person to look at it. */
export const BUSINESS_ALERTS = ['AMOUNT_MISMATCH', 'BACKORDERED', 'RECONCILIATION_FAILED'] as const;

interface AlarmSpec {
  readonly id: string;
  readonly description: string;
  readonly metric: cloudwatch.IMetric;
  readonly threshold: number;
  readonly comparison?: cloudwatch.ComparisonOperator;
  readonly evaluationPeriods?: number;
}

/** Alarms to email (SNS), the monthly budget and a dashboard (spec CL-08). */
export class MonitoringStack extends Stack {
  readonly topic: sns.Topic;
  readonly alarms: cloudwatch.Alarm[];

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.topic = new sns.Topic(this, 'AlarmTopic', {
      topicName: resourceName(config, 'alarms'),
      displayName: 'Checkout alarms',
      enforceSSL: true,
    });
    this.topic.addSubscription(new subscriptions.EmailSubscription(props.alarmEmail));

    this.alarms = this.alarmSpecs(props).map((spec) => this.alarm(config, spec));
    this.budget(config, props.alarmEmail);
    this.dashboard(config, props);
    this.justifyFindings();
  }

  private alarmSpecs(props: MonitoringStackProps): AlarmSpec[] {
    const { apiFunction, reconcileFunction, httpApi, database } = props;
    return [
      {
        id: 'ApiErrors',
        description: 'The API Lambda threw errors (unexpected failures, not 4xx)',
        metric: apiFunction.metricErrors({ period: FIVE_MINUTES, statistic: 'Sum' }),
        threshold: 1,
      },
      {
        id: 'ApiThrottles',
        description: 'The API Lambda was throttled (account concurrency)',
        metric: apiFunction.metricThrottles({ period: FIVE_MINUTES, statistic: 'Sum' }),
        threshold: 1,
      },
      {
        id: 'ApiServerErrorRate',
        description: `More than ${API_5XX_LIMIT_PERCENT}% of API Gateway responses are 5xx`,
        metric: new cloudwatch.MathExpression({
          expression: '100 * errors / IF(requests > 0, requests, 1)',
          usingMetrics: {
            errors: httpApi.metricServerError({ period: FIVE_MINUTES, statistic: 'Sum' }),
            requests: httpApi.metricCount({ period: FIVE_MINUTES, statistic: 'Sum' }),
          },
          label: '5xx %',
          period: FIVE_MINUTES,
        }),
        threshold: API_5XX_LIMIT_PERCENT,
        comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      },
      {
        id: 'ApiLatencyP95',
        description: `API Lambda p95 duration above ${API_P95_LIMIT_MS} ms`,
        metric: apiFunction.metricDuration({ period: FIVE_MINUTES, statistic: 'p95' }),
        threshold: API_P95_LIMIT_MS,
        comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 2,
      },
      {
        id: 'ReconcileErrors',
        description: 'The scheduled reconciliation failed (PENDING transactions may be stuck)',
        metric: reconcileFunction.metricErrors({ period: Duration.minutes(15), statistic: 'Sum' }),
        threshold: 1,
      },
      {
        id: 'DatabaseCpu',
        description: `RDS CPU above ${RDS_CPU_LIMIT_PERCENT}%`,
        metric: database.metricCPUUtilization({ period: FIVE_MINUTES }),
        threshold: RDS_CPU_LIMIT_PERCENT,
        comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 3,
      },
      {
        id: 'DatabaseFreeStorage',
        description: 'RDS free storage below 2 GB',
        metric: database.metricFreeStorageSpace({ period: FIVE_MINUTES }),
        threshold: RDS_FREE_STORAGE_LIMIT_BYTES,
        comparison: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      },
      ...props.natInstanceIds.map((instanceId, index) => ({
        id: `NatStatusCheck${index + 1}`,
        description: 'The NAT instance failed its status checks (no egress to the gateway)',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/EC2',
          metricName: 'StatusCheckFailed',
          dimensionsMap: { InstanceId: instanceId },
          period: FIVE_MINUTES,
          statistic: 'Maximum',
        }),
        threshold: 1,
        evaluationPeriods: 2,
      })),
      this.businessAlerts(props),
    ];
  }

  /** Counts the AlertLog events (AMOUNT_MISMATCH, BACKORDERED…) in the API and reconcile logs. */
  private businessAlerts(props: MonitoringStackProps): AlarmSpec {
    const metricName = 'BusinessAlerts';
    const namespace = PROJECT;
    const pattern = logs.FilterPattern.anyTerm(...BUSINESS_ALERTS);
    [props.apiFunction, props.reconcileFunction].forEach((fn, index) => {
      new logs.MetricFilter(this, `BusinessAlertsFilter${index + 1}`, {
        logGroup: fn.logGroup,
        filterPattern: pattern,
        metricNamespace: namespace,
        metricName,
        metricValue: '1',
      });
    });
    return {
      id: 'BusinessAlerts',
      description: `Business anomaly logged (${BUSINESS_ALERTS.join(', ')}): review it by hand`,
      metric: new cloudwatch.Metric({
        namespace,
        metricName,
        period: FIVE_MINUTES,
        statistic: 'Sum',
      }),
      threshold: 1,
    };
  }

  private alarm(config: StageConfig, spec: AlarmSpec): cloudwatch.Alarm {
    const alarm = new cloudwatch.Alarm(this, spec.id, {
      alarmName: resourceName(config, spec.id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()),
      alarmDescription: spec.description,
      metric: spec.metric,
      threshold: spec.threshold,
      comparisonOperator:
        spec.comparison ?? cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: spec.evaluationPeriods ?? 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new actions.SnsAction(this.topic));
    alarm.addOkAction(new actions.SnsAction(this.topic));
    return alarm;
  }

  private budget(config: StageConfig, email: string): void {
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: resourceName(config, 'monthly'),
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: config.monthlyBudgetUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: BUDGET_THRESHOLDS_PERCENT.map((threshold) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'EMAIL', address: email }],
      })),
    });
  }

  private dashboard(config: StageConfig, props: MonitoringStackProps): void {
    const { apiFunction, reconcileFunction, httpApi, database } = props;
    new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: resourceName(config, 'overview'),
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: 'Lambda invocations and errors',
            left: [apiFunction.metricInvocations(), reconcileFunction.metricInvocations()],
            right: [apiFunction.metricErrors(), reconcileFunction.metricErrors()],
          }),
          new cloudwatch.GraphWidget({
            title: 'API duration (p95) and throttles',
            left: [apiFunction.metricDuration({ statistic: 'p95' })],
            right: [apiFunction.metricThrottles()],
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: 'API Gateway requests and 5xx',
            left: [httpApi.metricCount()],
            right: [httpApi.metricServerError(), httpApi.metricClientError()],
          }),
          new cloudwatch.GraphWidget({
            title: 'RDS connections and CPU',
            left: [database.metricDatabaseConnections()],
            right: [database.metricCPUUtilization()],
          }),
        ],
      ],
    });
  }

  private justifyFindings(): void {
    NagSuppressions.addResourceSuppressions(this.topic, [
      {
        id: 'AwsSolutions-SNS2',
        reason:
          'CloudWatch alarms cannot publish to a topic encrypted with the AWS managed SNS key; the notifications hold no sensitive data and a customer managed key would add cost.',
      },
    ]);
  }
}
