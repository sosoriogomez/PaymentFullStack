import { parseAppEnv } from './env.schema';

describe('parseAppEnv', () => {
  const valid = {
    VITE_API_BASE_URL: '/api/',
    VITE_PG_BASE_URL: 'https://gateway.test/v1/',
    VITE_PG_PUBLIC_KEY: 'public-key',
    DEV: true,
  };

  it('should normalize trailing slashes and expose typed settings', () => {
    expect(parseAppEnv(valid)).toEqual({
      apiBaseUrl: '/api',
      pgBaseUrl: 'https://gateway.test/v1',
      pgPublicKey: 'public-key',
      isDevelopment: true,
    });
  });

  it('should default the api base url to the same origin', () => {
    const { VITE_API_BASE_URL: _omitted, ...rest } = valid;

    expect(parseAppEnv(rest).apiBaseUrl).toBe('/api');
  });

  it('should fail with the name of the missing variable', () => {
    expect(() => parseAppEnv({ ...valid, VITE_PG_PUBLIC_KEY: '' })).toThrow(/VITE_PG_PUBLIC_KEY/);
  });
});
