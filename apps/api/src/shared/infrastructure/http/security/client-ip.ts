/** Added by CloudFront (origin request policy): `IP:port` of the viewer, IPv4 or IPv6. */
export const CLOUDFRONT_VIEWER_ADDRESS = 'cloudfront-viewer-address';

export interface TrackedRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly ip?: string | undefined;
}

/**
 * The client IP for rate limiting (I-01). Behind CloudFront → API Gateway, `req.ip` is an edge
 * address, so on AWS the viewer address header is used; it is trustworthy there because only
 * CloudFront reaches the API (X-Origin-Verify) and it writes the header itself. Locally the
 * header could be forged, so `req.ip` is used.
 */
export function clientIpOf(request: TrackedRequest, behindCloudFront: boolean): string {
  const viewer = request.headers[CLOUDFRONT_VIEWER_ADDRESS];
  if (behindCloudFront && typeof viewer === 'string' && viewer.includes(':')) {
    return viewer.slice(0, viewer.lastIndexOf(':'));
  }
  return request.ip ?? 'unknown';
}
