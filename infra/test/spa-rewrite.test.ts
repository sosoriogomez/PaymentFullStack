import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SPA_REWRITE_SOURCE } from '../lib/constructs/spa-rewrite-function';

interface ViewerRequest {
  uri: string;
}

type Handler = (event: { request: ViewerRequest }) => ViewerRequest;

// The CloudFront Function is plain JavaScript: evaluate it in an isolated context and call its handler.
const sandbox: { handler?: Handler } = {};
runInNewContext(readFileSync(SPA_REWRITE_SOURCE, 'utf8'), sandbox);
const { handler } = sandbox;
if (!handler) throw new Error('spa-rewrite.js must define a handler function');

const rewrite = (uri: string) => handler({ request: { uri } }).uri;

describe('spa-rewrite CloudFront Function', () => {
  it.each(['/', '/transactions/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', '/products'])(
    'should serve index.html for the SPA route %p',
    (uri) => {
      expect(rewrite(uri)).toBe('/index.html');
    },
  );

  it.each(['/assets/index-abc123.js', '/images/products/smartwatch-640.avif', '/favicon.svg'])(
    'should leave the file %p untouched',
    (uri) => {
      expect(rewrite(uri)).toBe(uri);
    },
  );
});
