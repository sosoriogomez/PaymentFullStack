/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/test/setup/polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest-dom.ts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/test/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  // simple-icons se publica como ESM.
  transformIgnorePatterns: ['/node_modules/(?!simple-icons)'],
  moduleNameMapper: {
    // Jest no entiende import.meta.env: env.ts es el único módulo que lo lee.
    '^@/shared/config/env$': '<rootDir>/test/mocks/env.ts',
    '\\.module\\.css$': 'identity-obj-proxy',
    '\\.css$': '<rootDir>/test/mocks/style.ts',
    '\\.(svg|png|jpg|jpeg|avif|webp)$': '<rootDir>/test/mocks/file.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/main.tsx',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    // Lee import.meta.env, que no existe en Jest; su lógica vive en env.schema.ts (testeado).
    '!src/shared/config/env.ts',
  ],
  coverageReporters: ['text-summary', 'text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { branches: 85, functions: 85, lines: 85, statements: 85 },
  },
};
