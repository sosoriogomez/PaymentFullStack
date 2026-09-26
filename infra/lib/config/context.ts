import { type App } from 'aws-cdk-lib';

/** Reads a mandatory `-c key=value` context value, failing with an actionable message. */
export function requiredContext(app: App, key: string): string {
  const value: unknown = app.node.tryGetContext(key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing context "${key}": pass it with -c ${key}=<value>`);
  }
  return value.trim();
}
