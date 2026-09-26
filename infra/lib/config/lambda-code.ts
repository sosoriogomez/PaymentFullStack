import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as lambda from 'aws-cdk-lib/aws-lambda';

/** Output of `npm run build:lambda -w apps/api` (tsc + esbuild, ADR-005). */
export const LAMBDA_BUNDLE_DIR = join(__dirname, '..', '..', '..', 'apps', 'api', 'dist-lambda');

export function lambdaBundle(directory: string = LAMBDA_BUNDLE_DIR): lambda.Code {
  if (!existsSync(join(directory, 'lambda.js'))) {
    throw new Error(
      `Lambda bundle not found in ${directory}. Run "npm run build:lambda -w apps/api" first.`,
    );
  }
  return lambda.Code.fromAsset(directory);
}
