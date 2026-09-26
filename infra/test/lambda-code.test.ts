import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { lambdaBundle } from '../lib/config/lambda-code';

describe('lambdaBundle', () => {
  it('should explain how to build the bundle when it is missing', () => {
    expect(() => lambdaBundle(join(tmpdir(), 'does-not-exist'))).toThrow(
      /npm run build:lambda -w apps\/api/,
    );
  });

  it('should package the bundle directory as an asset', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bundle-'));
    writeFileSync(join(directory, 'lambda.js'), 'exports.handler = async () => ({});');

    expect(lambdaBundle(directory)).toBeInstanceOf(lambda.AssetCode);
  });
});
