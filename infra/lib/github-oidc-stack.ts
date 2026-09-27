import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { type Construct } from 'constructs';
import { PROJECT } from './config/stage-config';

const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com';
const GITHUB_AUDIENCE = 'sts.amazonaws.com';

export interface GithubOidcStackProps extends StackProps {
  /** `owner/repository` allowed to deploy. */
  readonly repository: string;
  /** Only workflows running on this branch can assume the role. */
  readonly branch: string;
  readonly stage: string;
}

/**
 * One-off stack (deployed by hand after `cdk bootstrap`): lets GitHub Actions deploy through OIDC,
 * without long-lived access keys (I-17).
 */
export class GithubOidcStack extends Stack {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = new iam.OidcProviderNative(this, 'GithubProvider', {
      url: GITHUB_OIDC_URL,
      clientIds: [GITHUB_AUDIENCE],
    });

    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: `${PROJECT}-${props.stage}-github-deploy`,
      description: 'Assumed by GitHub Actions (OIDC) to deploy the checkout',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': GITHUB_AUDIENCE,
          'token.actions.githubusercontent.com:sub': `repo:${props.repository}:ref:refs/heads/${props.branch}`,
        },
      }),
    });
    this.grantDeployment(props.stage);
    new CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: 'Value of the AWS_DEPLOY_ROLE_ARN variable of the GitHub repository',
    });
  }

  private grantDeployment(stage: string): void {
    const prefix = `${PROJECT}-${stage}`;
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-*`],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'PublishWebAssets',
        actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [
          `arn:${this.partition}:s3:::${prefix}-web-*`,
          `arn:${this.partition}:s3:::${prefix}-web-*/*`,
        ],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'InvalidateWebCache',
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [`arn:${this.partition}:cloudfront::${this.account}:distribution/*`],
      }),
    );
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RunMigrations',
        actions: ['lambda:InvokeFunction'],
        resources: [
          `arn:${this.partition}:lambda:${this.region}:${this.account}:function:${prefix}-migrate`,
        ],
      }),
    );
    NagSuppressions.addResourceSuppressions(
      this.deployRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Wildcards are scoped: CDK bootstrap roles (cdk-*), objects of the project web bucket and ' +
            'distributions of this account (their ids are only known after deployment).',
        },
      ],
      true,
    );
  }
}
