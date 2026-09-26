/** Minimal API Gateway HTTP API (payload format 2.0) event for handler tests. */
export function apiGatewayEvent(
  method: string,
  pathWithQuery: string,
  headers: Record<string, string> = {},
) {
  const [rawPath = '/', rawQueryString = ''] = pathWithQuery.split('?');
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath,
    rawQueryString,
    headers: { host: 'api.test', accept: 'application/json', ...headers },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api',
      domainName: 'api.test',
      domainPrefix: 'api',
      http: {
        method,
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '203.0.113.9',
        userAgent: 'jest',
      },
      requestId: 'request-id',
      routeKey: '$default',
      stage: '$default',
      time: '01/Oct/2026:15:00:00 +0000',
      timeEpoch: 1_790_866_800_000,
    },
    isBase64Encoded: false,
  };
}

export const lambdaContext = {
  awsRequestId: 'aws-request',
  getRemainingTimeInMillis: () => 20_000,
} as never;
