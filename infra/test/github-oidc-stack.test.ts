import { App, Aspects } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { expectNoNagFindings } from './support/nag';

/** ARNs are built with the `AWS::Partition` pseudo parameter, so they synthesize as Fn::Join. */
const arnEndingWith = (suffix: string) => ({
  'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, suffix]],
});

describe('GithubOidcStack', () => {
  const app = new App();
  const stack = new GithubOidcStack(app, 'Oidc', {
    repository: 'owner/repo',
    branch: 'main',
    stage: 'prod',
    env: { account: '123456789012', region: 'us-east-1' },
  });
  Aspects.of(app).add(new AwsSolutionsChecks());
  const template = Template.fromStack(stack);

  it('should register the GitHub OIDC provider natively (no custom resource)', () => {
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    template.resourceCountIs('AWS::Lambda::Function', 0);
  });

  it('should only trust workflows of the main branch of the repository', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'checkout-prod-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': 'repo:owner/repo:ref:refs/heads/main',
              },
            },
          }),
        ],
      },
    });
  });

  it('should trust the immutable subject of repositories created after 2026-07-15', () => {
    const immutable = new GithubOidcStack(new App(), 'OidcImmutable', {
      repository: 'owner@123/repo@456',
      branch: 'main',
      stage: 'prod',
      env: { account: '123456789012', region: 'us-east-1' },
    });
    Template.fromStack(immutable).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: Match.objectLike({
                'token.actions.githubusercontent.com:sub':
                  'repo:owner@123/repo@456:ref:refs/heads/main',
              }),
            },
          }),
        ],
      },
    });
  });

  it('should print the role ARN that GitHub needs', () => {
    template.hasOutput('DeployRoleArn', {
      Value: { 'Fn::GetAtt': [Match.stringLikeRegexp('^DeployRole'), 'Arn'] },
    });
  });

  it('should delegate infrastructure changes to the CDK bootstrap roles', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'AssumeCdkBootstrapRoles',
            Action: 'sts:AssumeRole',
            Resource: arnEndingWith(':iam::123456789012:role/cdk-*'),
          }),
          Match.objectLike({
            Sid: 'RunMigrations',
            Action: 'lambda:InvokeFunction',
            Resource: arnEndingWith(
              ':lambda:us-east-1:123456789012:function:checkout-prod-migrate',
            ),
          }),
        ]),
      },
    });
  });

  it('should have no unjustified cdk-nag findings', () => {
    expectNoNagFindings(stack);
  });
});
