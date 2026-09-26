import { Duration } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

export interface SecurityHeadersProps {
  readonly namePrefix: string;
  /** Host of the payment gateway: the only external origin the SPA may call (card tokenization). */
  readonly paymentGatewayHost: string;
}

const TWO_YEARS = Duration.days(730);

/** Content Security Policy of the SPA: everything same origin except the gateway (ADR-002). */
export const webContentSecurityPolicy = (paymentGatewayHost: string): string =>
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' https://${paymentGatewayHost}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";

/** Swagger UI needs its own scripts and inline styles from the same origin. */
export const DOCS_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const commonSecurityHeaders = (
  contentSecurityPolicy: string,
): cloudfront.ResponseSecurityHeadersBehavior => ({
  contentSecurityPolicy: { contentSecurityPolicy, override: true },
  contentTypeOptions: { override: true },
  frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
  // I-12: no `preload`, it cannot apply to *.cloudfront.net (only with a custom domain).
  strictTransportSecurity: {
    accessControlMaxAge: TWO_YEARS,
    includeSubdomains: true,
    preload: false,
    override: true,
  },
  xssProtection: { protection: false, override: true },
});

/** Response headers policies (OWASP): SPA, API and API docs. */
export class SecurityHeadersPolicies extends Construct {
  readonly web: cloudfront.ResponseHeadersPolicy;
  readonly api: cloudfront.ResponseHeadersPolicy;
  readonly docs: cloudfront.ResponseHeadersPolicy;

  constructor(scope: Construct, id: string, props: SecurityHeadersProps) {
    super(scope, id);
    this.web = new cloudfront.ResponseHeadersPolicy(this, 'Web', {
      responseHeadersPolicyName: `${props.namePrefix}-web-headers`,
      securityHeadersBehavior: {
        ...commonSecurityHeaders(webContentSecurityPolicy(props.paymentGatewayHost)),
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
            override: true,
          },
          { header: 'Cross-Origin-Opener-Policy', value: 'same-origin', override: true },
        ],
      },
    });
    this.api = new cloudfront.ResponseHeadersPolicy(this, 'Api', {
      responseHeadersPolicyName: `${props.namePrefix}-api-headers`,
      securityHeadersBehavior: {
        ...commonSecurityHeaders(API_CONTENT_SECURITY_POLICY),
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [{ header: 'Cache-Control', value: 'no-store', override: false }],
      },
    });
    this.docs = new cloudfront.ResponseHeadersPolicy(this, 'Docs', {
      responseHeadersPolicyName: `${props.namePrefix}-docs-headers`,
      securityHeadersBehavior: {
        ...commonSecurityHeaders(DOCS_CONTENT_SECURITY_POLICY),
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
          override: true,
        },
      },
    });
  }
}
