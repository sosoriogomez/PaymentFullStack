/** @type {import('jest').Config} */
const project = (displayName, testMatch, extra = {}) => ({
  displayName,
  testMatch,
  ...extra,
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
});

/** Integration and e2e tests run against a real Postgres (Testcontainers or TEST_DATABASE_URL). */
const withDatabase = {
  globalSetup: '<rootDir>/test/support/database/global-setup.ts',
  globalTeardown: '<rootDir>/test/support/database/global-teardown.ts',
  testTimeout: 30_000,
};

module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/database/cli.ts',
    '!src/**/*.module.ts',
    '!src/**/migrations/**',
    '!src/**/seeds/**',
  ],
  coverageReporters: ['text-summary', 'text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { branches: 85, functions: 85, lines: 85, statements: 85 },
  },
  projects: [
    project('unit', ['<rootDir>/src/**/*.spec.ts']),
    project('integration', ['<rootDir>/test/integration/**/*.int-spec.ts'], withDatabase),
    project('e2e', ['<rootDir>/test/e2e/**/*.e2e-spec.ts'], withDatabase),
  ],
};
