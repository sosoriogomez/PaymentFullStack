import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { applyProjectAspects } from '../lib/config/app-aspects';
import { STAGES } from '../lib/config/stage-config';

describe('applyProjectAspects', () => {
  it('should tag every resource with the project, stage and tool', () => {
    const app = new App();
    const stack = new Stack(app, 'Tagged');
    new sqs.Queue(stack, 'Queue', { enforceSSL: true });

    applyProjectAspects(app, STAGES.prod);

    Template.fromStack(stack).hasResourceProperties('AWS::SQS::Queue', {
      Tags: [
        { Key: 'managed-by', Value: 'cdk' },
        { Key: 'project', Value: 'checkout' },
        { Key: 'stage', Value: 'prod' },
      ],
    });
  });
});
