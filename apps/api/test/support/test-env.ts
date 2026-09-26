/** Minimal valid environment for tests. Values are fake: no test ever reaches a real gateway. */
export const testEnv = (
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> => ({
  NODE_ENV: 'test',
  APP_ENV: 'local',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://checkout:checkout@localhost:5432/checkout',
  PG_BASE_URL: 'https://gateway.test/v1',
  PG_PUBLIC_KEY: 'test-public-key',
  PG_PRIVATE_KEY: 'test-private-key',
  PG_INTEGRITY_SECRET: 'test-integrity-secret',
  PG_EVENTS_SECRET: 'test-events-secret',
  ...overrides,
});
