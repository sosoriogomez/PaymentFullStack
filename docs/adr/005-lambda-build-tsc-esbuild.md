# ADR-005 · Build de Lambda en dos pasos: tsc → esbuild

- **Estado:** Aceptada
- **Fecha:** 2026-09-26
- **Feature:** BE-12 (corrección C-01)

## Contexto

NestJS resuelve la inyección de dependencias por tipo con los metadatos que TypeScript emite cuando `emitDecoratorMetadata` está activo (`design:paramtypes`). `class-validator`/`class-transformer` (`@ValidateNested`, `@Type`) y el plugin de Swagger dependen de lo mismo.

**esbuild no emite esos metadatos**, y `NodejsFunction` de CDK usa esbuild. Un bundle hecho así compila y arranca, pero falla en runtime al resolver dependencias. Además, TypeORM no puede usar globs (`dist/**/*.entity.js`) dentro de un único archivo bundleado.

## Decisión

1. `nest build` compila con `tsc`, que sí emite los metadatos (y reescribe los alias de paths).
2. `scripts/bundle-lambda.mjs` bundlea con esbuild **el JavaScript ya compilado** (`dist/lambda.js`, `dist/migrate.js`, `dist/reconcile.js`) en `dist-lambda/`, con `keepNames` y como *externals* los módulos opcionales que Nest y TypeORM intentan cargar pero la app no usa.
3. Se copian al bundle `swagger-ui-dist` (Swagger UI sirve sus assets desde disco) y el bundle CA de RDS (`certs/global-bundle.pem`).
4. CDK usa `lambda.Function` con `Code.fromAsset('apps/api/dist-lambda')`, no `NodejsFunction`.
5. Entidades y migraciones de TypeORM se registran como listas explícitas de clases.

## Verificación

- `npm run smoke:lambda` carga cada handler bundleado (corre en CI).
- Se invocó `dist-lambda/lambda.js` con eventos reales de API Gateway v2 contra PostgreSQL: health 200, listado con query string 200 y validación 400 en formato problem+json. Es decir, los controllers, los pipes, los filtros y los casos de uso inyectados funcionan dentro del bundle.

## Consecuencias

- El build tiene un paso más, pero el comportamiento en Lambda es idéntico al local y al de los tests.
- El bundle (~5 MB sin comprimir) incluye el AWS SDK en su versión fijada, en vez de depender del que trae el runtime.
