// Second step of the Lambda build (ADR-005). `nest build` (tsc) has already emitted dist/ with
// decorator metadata; esbuild only bundles that JavaScript. Output: dist-lambda/.
import { build } from 'esbuild';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist-lambda');
const require = createRequire(import.meta.url);

export const ENTRY_POINTS = ['lambda', 'migrate', 'reconcile'];

/** Optional requires of Nest and TypeORM that this app never uses, plus Swagger UI (copied as files). */
export const EXTERNALS = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  '@nestjs/platform-fastify',
  '@fastify/static',
  'class-transformer/storage',
  'mysql',
  'mysql2',
  'oracledb',
  'mssql',
  'sqlite3',
  'better-sqlite3',
  'sql.js',
  'mongodb',
  'redis',
  'ioredis',
  'hdb-pool',
  '@sap/hana-client',
  '@sap/hana-client/extension/Stream',
  '@google-cloud/spanner',
  'typeorm-aurora-data-api-driver',
  'react-native-sqlite-storage',
  'pg-native',
  'pg-query-stream',
  'swagger-ui-dist',
];

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

await rm(OUT, { recursive: true, force: true });
const entryPoints = {};
for (const name of ENTRY_POINTS) {
  const file = join(ROOT, 'dist', `${name}.js`);
  if (await exists(file)) entryPoints[name] = file;
}

await build({
  entryPoints,
  outdir: OUT,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: true,
  sourcemap: true,
  keepNames: true, // Nest resolves some providers by class name
  external: EXTERNALS,
  logLevel: 'warning',
  legalComments: 'none',
});

// Swagger UI serves its static assets from disk: ship the package next to the bundle (I-14).
try {
  const swaggerUi = dirname(require.resolve('swagger-ui-dist/package.json'));
  await cp(swaggerUi, join(OUT, 'node_modules', 'swagger-ui-dist'), { recursive: true });
} catch {
  // swagger-ui-dist is only present once the API docs are enabled.
}

// CA bundle to verify the RDS certificate (rds.force_ssl = 1).
await mkdir(join(OUT, 'certs'), { recursive: true });
await cp(join(ROOT, 'certs', 'global-bundle.pem'), join(OUT, 'certs', 'global-bundle.pem'));

console.log(`Lambda bundle ready in dist-lambda/ (${Object.keys(entryPoints).join(', ')})`);
