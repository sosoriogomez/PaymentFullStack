import { clientIpOf } from './client-ip';

describe('clientIpOf', () => {
  const request = (viewer?: string) => ({
    headers: viewer ? { 'cloudfront-viewer-address': viewer } : {},
    ip: '10.0.0.1',
  });

  it.each([
    ['198.51.100.10:46532', '198.51.100.10'],
    ['2001:0db8:85a3:0000:0000:8a2e:0370:7334:46532', '2001:0db8:85a3:0000:0000:8a2e:0370:7334'],
  ])('should take the viewer IP from %s behind CloudFront', (viewer, ip) => {
    expect(clientIpOf(request(viewer), true)).toBe(ip);
  });

  it('should ignore the header outside AWS, where anyone could send it', () => {
    expect(clientIpOf(request('198.51.100.10:46532'), false)).toBe('10.0.0.1');
  });

  it('should fall back to the socket address, or a constant when unknown', () => {
    expect(clientIpOf(request(), true)).toBe('10.0.0.1');
    expect(clientIpOf(request('garbage'), true)).toBe('10.0.0.1');
    expect(clientIpOf({ headers: {} }, true)).toBe('unknown');
  });
});
