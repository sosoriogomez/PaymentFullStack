import { parseAppEnv } from './env.schema';

/** The only module that reads `import.meta.env` (Jest maps it to test/mocks/env.ts). */
export const env = parseAppEnv(import.meta.env);
