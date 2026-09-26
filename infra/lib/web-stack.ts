import { CfnOutput, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NagSuppressions } from 'cdk-nag';
import { type Construct } from 'constructs';
import { resourceName, type StageConfig } from './config/stage-config';
import { SecurityHeadersPolicies } from './constructs/security-headers-policy';
import { SpaRewriteFunction } from './constructs/spa-rewrite-function';

export interface WebStackProps extends StackProps {
  readonly config: StageConfig;
  readonly httpApi: apigwv2.IHttpApi;
  readonly originVerifySecret: secretsmanager.ISecret;
  readonly paymentGatewayHost: string;
}

export const ORIGIN_VERIFY_HEADER = 'X-Origin-Verify';

/** One HTTPS entry point: CloudFront serves the SPA (S3) and forwards /api/* to the HTTP API. */
/** Request headers the API reads; everything else stays at the edge. */
export const API_FORWARDED_HEADERS = [
  'Accept',
  'Content-Type',
  'Origin',
  'Idempotency-Key',
  'X-Request-Id',
  'X-Event-Checksum',
  'CloudFront-Viewer-Address',
] as const;

export class WebStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const { config } = props;
    const namePrefix = resourceName(config, 'web');

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: `${namePrefix}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const headers = new SecurityHeadersPolicies(this, 'SecurityHeaders', {
      namePrefix: resourceName(config, 'cdn'),
      paymentGatewayHost: props.paymentGatewayHost,
    });
    const spaRewrite = new SpaRewriteFunction(this, 'SpaRewrite', {
      functionName: resourceName(config, 'spa-rewrite'),
    });
    const apiOrigin = new origins.HttpOrigin(Fn.parseDomainName(props.httpApi.apiEndpoint), {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
      // Resolved by CloudFormation as a dynamic reference: never in plain text in the template.
      customHeaders: {
        [ORIGIN_VERIFY_HEADER]: props.originVerifySecret.secretValue.unsafeUnwrap(),
      },
    });
    // Only what the API reads, plus the viewer address for per-IP limits (I-01). Never Host:
    // API Gateway answers for its own domain. Managed policies with "all viewer headers" cannot
    // include CloudFront headers.
    const apiOriginRequest = new cloudfront.OriginRequestPolicy(this, 'ApiOriginRequest', {
      originRequestPolicyName: resourceName(config, 'api-origin-request'),
      comment: 'Headers and query strings the checkout API needs',
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(...API_FORWARDED_HEADERS),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
    });
    const apiBehavior = (
      policy: cloudfront.IResponseHeadersPolicy,
    ): cloudfront.BehaviorOptions => ({
      origin: apiOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: apiOriginRequest,
      responseHeadersPolicy: policy,
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Checkout SPA and API',
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: headers.web,
        functionAssociations: [
          { function: spaRewrite.function, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/api/docs*': apiBehavior(headers.docs),
        '/api/*': apiBehavior(headers.api),
      },
    });

    new CfnOutput(this, 'AppUrl', { value: `https://${this.distribution.distributionDomainName}` });
    new CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new CfnOutput(this, 'WebBucketName', { value: this.bucket.bucketName });
    this.justifyFindings();
  }

  private justifyFindings(): void {
    NagSuppressions.addResourceSuppressions(this.bucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'The bucket only holds the public build of the SPA; CloudFront is its only reader (OAC).',
      },
    ]);
    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR1',
        reason: 'The store sells in Colombia but must be reachable by evaluators anywhere.',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason:
          'WAF is an optional improvement (cost); the API is throttled by API Gateway and per IP in the app.',
      },
      {
        id: 'AwsSolutions-CFR3',
        reason: 'Access logs are off to keep costs near zero during the evaluation.',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason:
          'The default *.cloudfront.net certificate does not allow pinning the minimum TLS version; a custom domain would.',
      },
    ]);
  }
}
