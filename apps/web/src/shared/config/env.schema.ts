import { z } from 'zod';

export interface AppEnv {
  readonly apiBaseUrl: string;
  readonly pgBaseUrl: string;
  readonly pgPublicKey: string;
  readonly isDevelopment: boolean;
}

const rawEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default('/api'),
  VITE_PG_BASE_URL: z.url(),
  VITE_PG_PUBLIC_KEY: z.string().min(1),
  DEV: z.boolean().default(false),
});

export function parseAppEnv(source: Record<string, unknown>): AppEnv {
  const result = rawEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid build configuration:\n${z.prettifyError(result.error)}`);
  }
  const raw = result.data;
  return {
    apiBaseUrl: raw.VITE_API_BASE_URL.replace(/\/+$/, ''),
    pgBaseUrl: raw.VITE_PG_BASE_URL.replace(/\/+$/, ''),
    pgPublicKey: raw.VITE_PG_PUBLIC_KEY,
    isDevelopment: raw.DEV,
  };
}
