import { type AppEnv } from '@/shared/config/env.schema';

export const env: AppEnv = {
  apiBaseUrl: '/api',
  pgBaseUrl: 'https://gateway.test/v1',
  pgPublicKey: 'test-public-key',
  isDevelopment: false,
};
