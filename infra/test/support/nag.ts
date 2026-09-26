import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { type Stack } from 'aws-cdk-lib';

/** Fails when cdk-nag reports an error or warning that is not suppressed with a written reason. */
export function expectNoNagFindings(stack: Stack): void {
  const errors = Annotations.fromStack(stack).findError(
    '*',
    Match.stringLikeRegexp('AwsSolutions-.*'),
  );
  const warnings = Annotations.fromStack(stack).findWarning(
    '*',
    Match.stringLikeRegexp('AwsSolutions-.*'),
  );
  expect(
    [...errors, ...warnings].map(
      (finding) => `${finding.id}: ${JSON.stringify(finding.entry.data)}`,
    ),
  ).toEqual([]);
}
