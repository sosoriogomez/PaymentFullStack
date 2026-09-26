import { App, Aspects, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { AwsSolutionsChecks } from 'cdk-nag';
import { STAGES } from '../lib/config/stage-config';
import { WebStack } from '../lib/web-stack';
import { expectNoNagFindings } from './support/nag';

describe('WebStack', () => {
  const app = new App();
  const env = { account: '123456789012', region: 'us-east-1' };
  const shared = new Stack(app, 'Shared', { env });
  const httpApi = new apigwv2.HttpApi(shared, 'HttpApi', { createDefaultStage: true });
  const originVerifySecret = new secretsmanager.Secret(shared, 'OriginSecret');
  const stack = new WebStack(app, 'Web', {
    config: STAGES.prod,
    env,
    httpApi,
    originVerifySecret,
    paymentGatewayHost: 'gateway.example',
  });
  Aspects.of(app).add(new AwsSolutionsChecks());
  const template = Template.fromStack(stack);
  const distributionConfig = () =>
    (
      Object.values(template.findResources('AWS::CloudFront::Distribution'))[0]?.Properties as {
        DistributionConfig: unknown;
      }
    ).DistributionConfig as {
      DefaultCacheBehavior: { FunctionAssociations?: unknown[] };
      CacheBehaviors: {
        PathPattern: string;
        FunctionAssociations?: unknown[];
        OriginRequestPolicyId: string;
        CachePolicyId: string;
      }[];
      Origins: {
        CustomOriginConfig?: unknown;
        OriginCustomHeaders?: { HeaderName: string; HeaderValue: unknown }[];
      }[];
    };

  it('should keep the bucket private, encrypted and TLS only', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('should redirect to HTTPS and serve HTTP/2 and HTTP/3', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        HttpVersion: 'http2and3',
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
          Compress: true,
        }),
      }),
    });
  });

  it('should rewrite SPA routes only on the default behavior (never on /api/*)', () => {
    const config = distributionConfig();

    expect(config.DefaultCacheBehavior.FunctionAssociations).toHaveLength(1);
    expect(config.CacheBehaviors.map((behavior) => behavior.PathPattern)).toEqual([
      '/api/docs*',
      '/api/*',
    ]);
    config.CacheBehaviors.forEach((behavior) => {
      expect(behavior.FunctionAssociations).toBeUndefined();
    });
    template.resourcePropertiesCountIs(
      'AWS::CloudFront::Distribution',
      { DistributionConfig: { CustomErrorResponses: Match.anyValue() } },
      0,
    );
  });

  it('should not cache the API and should forward viewer headers except Host', () => {
    const apiBehavior = distributionConfig().CacheBehaviors.find(
      (behavior) => behavior.PathPattern === '/api/*',
    );

    expect(apiBehavior?.CachePolicyId).toBe('4135ea2d-6df8-44a3-9df3-4b5a84be39ad'); // CachingDisabled
    expect(apiBehavior?.OriginRequestPolicyId).toBe('b689b0a8-53d0-40ab-baf2-68738e2966ac'); // AllViewerExceptHostHeader
  });

  it('should add the origin verify header from Secrets Manager, not as a literal', () => {
    const apiOrigin = distributionConfig().Origins.find((origin) => origin.CustomOriginConfig);
    const header = apiOrigin?.OriginCustomHeaders?.find(
      (item) => item.HeaderName === 'X-Origin-Verify',
    );

    expect(JSON.stringify(header?.HeaderValue)).toContain('{{resolve:secretsmanager:');
  });

  it('should send OWASP security headers with a strict CSP that only allows the gateway', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        Name: 'checkout-prod-cdn-web-headers',
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: {
            ContentSecurityPolicy: Match.stringLikeRegexp(
              "connect-src 'self' https://gateway.example;",
            ),
            Override: true,
          },
          FrameOptions: { FrameOption: 'DENY', Override: true },
          ContentTypeOptions: { Override: true },
          ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
          StrictTransportSecurity: {
            AccessControlMaxAgeSec: 63072000,
            IncludeSubdomains: true,
            Preload: false,
            Override: true,
          },
        }),
        CustomHeadersConfig: {
          Items: Match.arrayWith([
            Match.objectLike({ Header: 'Permissions-Policy' }),
            Match.objectLike({ Header: 'Cross-Origin-Opener-Policy', Value: 'same-origin' }),
          ]),
        },
      }),
    });
  });

  it('should lock the API responses down and relax only what Swagger UI needs', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        Name: 'checkout-prod-cdn-api-headers',
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: {
            ContentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
            Override: true,
          },
        }),
      }),
    });
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({ Name: 'checkout-prod-cdn-docs-headers' }),
    });
  });

  it('should export the URL, distribution and bucket for the pipeline', () => {
    template.hasOutput('AppUrl', {});
    template.hasOutput('DistributionId', {});
    template.hasOutput('WebBucketName', {});
  });

  it('should have no unjustified cdk-nag findings', () => {
    expectNoNagFindings(stack);
  });
});
