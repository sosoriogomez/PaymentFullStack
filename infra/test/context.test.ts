import { App } from 'aws-cdk-lib';
import { requiredContext } from '../lib/config/context';

describe('requiredContext', () => {
  it('should return the trimmed value', () => {
    const app = new App({ context: { pgHost: ' gateway.example ' } });

    expect(requiredContext(app, 'pgHost')).toBe('gateway.example');
  });

  it.each([undefined, '', '   '])('should explain how to pass a missing value (%p)', (value) => {
    const app = new App({ context: value === undefined ? {} : { pgHost: value } });

    expect(() => requiredContext(app, 'pgHost')).toThrow(
      'Missing context "pgHost": pass it with -c pgHost=<value>',
    );
  });
});
