import { join } from 'node:path';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';

export const SPA_REWRITE_SOURCE = join(__dirname, '..', '..', 'functions', 'spa-rewrite.js');

/**
 * SPA fallback without customErrorResponses: those apply to the whole distribution and would turn
 * the API's 403/404 into index.html.
 */
export class SpaRewriteFunction extends Construct {
  readonly function: cloudfront.Function;

  constructor(scope: Construct, id: string, props: { readonly functionName: string }) {
    super(scope, id);
    this.function = new cloudfront.Function(this, 'Function', {
      functionName: props.functionName,
      comment: 'Serves index.html for SPA routes',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromFile({ filePath: SPA_REWRITE_SOURCE }),
    });
  }
}
