import { parameterPrefix, resourceName, STAGES, stageConfig } from '../lib/config/stage-config';

describe('stageConfig', () => {
  it('should return the configuration of a known stage', () => {
    expect(stageConfig('prod')).toBe(STAGES.prod);
  });

  it('should reject unknown stages listing the valid ones', () => {
    expect(() => stageConfig('dev')).toThrow('Unknown stage "dev". Valid stages: prod');
    expect(() => stageConfig(undefined)).toThrow(/Unknown stage/);
  });

  it('should not reserve lambda concurrency by default (C-02)', () => {
    expect(STAGES.prod.api.reservedConcurrency).toBeUndefined();
  });

  it('should build prefixed resource names and parameter paths', () => {
    expect(resourceName(STAGES.prod, 'api')).toBe('checkout-prod-api');
    expect(parameterPrefix(STAGES.prod)).toBe('/checkout/prod');
  });
});
