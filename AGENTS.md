# AGENTS.md

Guía para cambiar este repositorio sin romper lo que ya funciona. Sirve para personas y para asistentes de código. El porqué de cada regla está en [`docs/adr/`](docs/adr/README.md) y en [`docs/specs/`](docs/specs/00-overview.md).

## 1. El proyecto

Checkout de un producto que se paga con tarjeta a través de una pasarela de pagos (*payment gateway*, PG) en modo sandbox. Es un monorepo con npm workspaces:

| Carpeta | Qué es | Stack |
|---|---|---|
| `apps/api` | API REST bajo `/api/v1` | NestJS 11, TypeScript estricto, TypeORM, PostgreSQL 16 |
| `apps/web` | SPA | React 19, Redux Toolkit, React Router, Vite, CSS Modules, zod |
| `infra` | Infraestructura en AWS | CDK v2: CloudFront, S3, API Gateway, Lambda, RDS, EventBridge Scheduler |
| `docs` | Specs, planes, ADR, seguridad y colección de Postman | Markdown |

Para entender el sistema antes de tocarlo, lee el [`README.md`](README.md) y las ADR.

## 2. Comandos

Usa Node 24 (`.nvmrc`). Todos los comandos van desde la raíz.

```bash
npm ci                               # instala exactamente lo que fija package-lock.json
docker compose up -d db              # PostgreSQL local
npm run db:migrate -w apps/api       # migraciones y catálogo inicial
npm run start:dev -w apps/api        # API en http://localhost:3000 (Swagger en /api/docs)
npm run dev -w apps/web              # web en http://localhost:5173
```

Instala con `npm ci`, no con `npm install`: `npm install` puede resolver versiones distintas a las del lockfile (por ejemplo, mezclar NestJS 11 y 12) y romper el build.

Antes de abrir un PR, corre esto en cada workspace que tocaste:

| Workspace | Comandos |
|---|---|
| `apps/api` | `npm run lint -w apps/api`, `npm run typecheck -w apps/api`, `npm run depcruise -w apps/api`, `npm run test:unit -w apps/api`, `npm run test:int -w apps/api`, `npm run test:e2e -w apps/api` |
| `apps/web` | `npm run lint -w apps/web`, `npm run stylelint -w apps/web`, `npm run typecheck -w apps/web`, `npm test -w apps/web` |
| `infra` | `npm run lint -w infra`, `npm run typecheck -w infra`, `npm test -w infra`, `npm run synth -w infra -- -c pgHost=gateway.example` |
| Raíz | `npm run format:check` |

Las pruebas de integración y e2e de la API levantan PostgreSQL con Testcontainers, así que necesitan Docker abierto. También pueden usar una base existente con `TEST_DATABASE_URL`.

## 3. API (`apps/api`)

### Capas

Cada módulo de `src/modules/<módulo>/` tiene tres carpetas, y las dependencias solo apuntan hacia adentro:

- `domain/`: entidades, value objects, reglas y puertos (interfaces). TypeScript puro.
- `application/`: casos de uso. Dependen del dominio y de los puertos, nunca de adaptadores.
- `infrastructure/`: controladores, DTOs, repositorios TypeORM, adaptadores HTTP y mappers.

El kernel compartido (`src/shared/kernel/`) también es puro. La infraestructura compartida está en `src/shared/infrastructure/`.

`npm run depcruise -w apps/api` hace cumplir las reglas de `.dependency-cruiser.cjs`: `no-circular`, `domain-is-pure`, `application-depends-only-on-domain` y `modules-talk-through-ports`. Si falla, mueve el código a la capa que corresponde; no relajes la regla.

### Reglas

- **Casos de uso sin Nest.** Son clases normales que reciben sus dependencias por el constructor, y se registran en el `*.module.ts` con `provide`, `inject` y `useFactory`. Si un caso de uso nuevo no se registra, la API no arranca.
- **Puertos con token.** Las interfaces no existen en ejecución, así que cada puerto exporta un `Symbol` (por ejemplo, `PRODUCT_REPOSITORY`) que se usa en `provide` e `inject`. Para usarlo desde otro módulo, va en `exports` y ese módulo lo importa.
- **Errores con ROP.** El dominio y la aplicación devuelven `Result` o `AsyncResult` (`src/shared/kernel/result.ts` y `async-result.ts`) y no lanzan excepciones. Solo los controladores convierten un error en excepción, con `unwrapOrThrow`.
- **Códigos de error nuevos.** Se agregan a la unión `DomainError` (`src/shared/kernel/domain-error.ts`) y a la tabla de `src/shared/infrastructure/http/domain-error.http-mapper.ts`. Si falta en la tabla, TypeScript no compila. Los errores salen como Problem Details (RFC 9457) y nunca exponen detalles internos.
- **Dinero en centavos enteros.** Usa `Money` (`src/shared/kernel/money.ts`); en la base, `bigint`. Nunca decimales.
- **Tiempo, ids y hashes inyectados.** El dominio y la aplicación usan los puertos `Clock`, `IdGenerator` y `Hasher` (`src/shared/kernel/ports.ts`), nunca `Date.now()` ni `randomUUID()` directos, para que las pruebas sean deterministas.
- **Validación en el borde.** Los DTOs de entrada usan class-validator, y el `ValidationPipe` global tiene `whitelist` y `forbidNonWhitelisted`: un campo que no está en el DTO responde 400. Las variables de entorno se validan con zod en `src/shared/infrastructure/config/env.schema.ts`, y las respuestas de la pasarela con los esquemas de `src/modules/payment-gateway/infrastructure/`.
- **Rutas.** El prefijo `/api` y la versión por URI se configuran en `src/bootstrap/configure-app.ts`; cada controlador declara `@Controller({ path, version: '1' })`. Una ruta fija nueva (por ejemplo, `products/summary`) se declara antes de la que tiene parámetro (`products/:id`); si no, Express la toma como un id y el validador de UUID responde 400. Toda ruta nueva lleva `@ApiOperation`, una sola `@ApiTags` y se agrega a la lista de `test/e2e/openapi.e2e-spec.ts`.
- **Límites.** Los cuerpos JSON tienen como máximo 16 KB (32 KB solo en el webhook), y hay límite de peticiones por IP (`src/shared/infrastructure/http/security/rate-limit.ts`). No los subas sin una razón escrita.
- **Arranque común.** `createApp` y `configureApp` (`src/bootstrap/`) los usan el servidor local (`main.ts`), la Lambda (`lambda.ts`) y las pruebas e2e. La configuración HTTP se cambia ahí, no en un solo punto de entrada.

## 4. Base de datos

- **Solo migraciones nuevas.** El esquema cambia únicamente con migraciones en `apps/api/src/database/migrations/`. Nunca edites una migración que ya corrió: crea otra con un timestamp mayor (`<timestamp>-<nombre>.ts`, clase `<Nombre><timestamp>`) y agrégala al final de `MIGRATIONS` en `migrations/index.ts`. No se usan globs.
- **Compatibles hacia atrás.** La Lambda `migrate` corre después de publicar el código nuevo, así que una migración debe funcionar con el código anterior y con el nuevo: primero se agrega (por ejemplo, una columna con `DEFAULT`) y en otro cambio se quita lo viejo (*expand/contract*, I-16). Escribe siempre el `down()`.
- **Prueba de la lista.** Agrega la migración a la lista esperada de `test/integration/database/migrations-and-seed.int-spec.ts`.
- **Un campo nuevo se recorre de punta a punta:** migración, entidad `*.orm-entity.ts`, dominio, `*.mapper.ts`, respuesta HTTP, contrato zod de la web (`apps/web/src/shared/api/contracts.ts`) y builders de prueba.
- **Reglas críticas también en la base**, con `CHECK` y `UNIQUE` (por ejemplo, `stock >= 0`).
- **El seed** (`src/database/seeds/products.seed.ts`) es el catálogo inicial de un ambiente nuevo y no pisa el stock existente. Para cambiar datos de producción se usa una migración de datos, como `1790532600000-restock-catalog.ts`.

## 5. Invariantes de pagos

No se rompen. Si un cambio lo exige, primero se escribe un ADR.

1. El número, el CVC y la fecha de la tarjeta solo existen en el formulario y en la llamada de tokenización, que va del navegador a la pasarela con la llave pública (ADR-002). Nunca llegan a la API, a las acciones o al estado de Redux, a `localStorage` ni a los logs.
2. El token de la tarjeta es de un solo uso. No se persiste en `localStorage` ni en la base, y la web lo olvida cuando el cobro se crea.
3. Cada `POST /api/v1/transactions` lleva una `Idempotency-Key`. Misma llave y misma compra: se repite la respuesta (200 con `Idempotent-Replayed: true`). Misma llave y otra compra: 422 (ADR-006).
4. El `POST` de cobro a la pasarela nunca se reintenta automáticamente. Si no hay respuesta, la transacción queda `PENDING` y se resuelve por su referencia. Solo se reintentan las consultas `GET`.
5. `FinalizeTransaction` es el único camino a un estado final y actualiza con `UPDATE … WHERE status = 'PENDING'`. El polling, el webhook y la reconciliación lo usan, así que debe seguir siendo idempotente.
6. El stock se descuenta solo cuando el pago queda `APPROVED`, con el `UPDATE` atómico de `decrementStockIfAvailable`. Si no alcanza, la entrega queda `BACKORDERED`. El stock nunca es negativo (ADR-001).
7. El cliente nunca envía montos. La API recalcula el precio con su `FeePolicy` y, al finalizar, comprueba que la referencia, el monto y la moneda coincidan con los de la pasarela; si no coinciden, la transacción pasa a `ERROR` (I-06).
8. Los tokens de aceptación son de un solo uso: se piden en cada compra y no se guardan en caché (I-25).
9. El webhook se verifica con el secreto de eventos, en tiempo constante, antes de leer su contenido. Todo evento auténtico recibe 200, para que la pasarela no lo reintente.
10. La llave privada y los secretos de la pasarela solo existen en la API.

## 6. Web (`apps/web`)

- **Por funcionalidad.** Cada carpeta de `src/features/` (`catalog`, `checkout`, `transaction`) tiene su slice, selectores, thunks, componentes, páginas y un `domain/` con validaciones puras. Lo compartido va en `src/shared/` (`api`, `ui`, `lib`, `hooks`, `i18n`, `config`).
- **Estado.** Lo que comparten varias pantallas va en un slice de Redux Toolkit; lo que usa un solo componente va en `useState`. Los componentes leen con `useAppSelector` y cambian el estado despachando acciones con `useAppDispatch`.
- **Thunks con datos de tarjeta, a mano.** No uses `createAsyncThunk` cuando el argumento lleva datos de la tarjeta: lo copia en `meta.arg` de cada acción. Hay un test que verifica que ninguna acción contiene el número.
- **Persistencia con lista de permitidos.** Lo que se guarda en `localStorage` se elige campo por campo en `src/app/persistence/persisted-state.ts` y su esquema. Un campo nuevo del estado no se guarda hasta que alguien lo agrega ahí, a propósito.
- **Contratos.** Toda respuesta de la API se valida con los esquemas zod de `src/shared/api/contracts.ts`. Si la API cambia, el contrato cambia en el mismo PR.
- **Puertos.** Los servicios externos entran por puertos (`src/shared/api/ports.ts`, `src/shared/lib/ports.ts`), y solo `src/app/composition.ts` elige las implementaciones reales.
- **Entorno.** Solo `src/shared/config/env.ts` lee `import.meta.env`, y los valores se validan en `env.schema.ts`.
- **Orden de arranque.** `src/main.tsx` importa primero `styles/global.css` y después `shared/config/zod-config`, que configura zod sin JIT para no violar la CSP (I-26). No cambies ese orden.
- **Textos.** Van en `src/shared/i18n/es.ts`, y los mensajes de error en `es-errors.ts`. No escribas textos sueltos en los componentes.
- **Estilos.** CSS Modules con los tokens de `src/styles/tokens.css`, dentro de las capas de cascada que declara `global.css`. Sin frameworks de CSS.
- **Accesibilidad.** Controles con etiqueta, roles ARIA en los modales, foco atrapado y cierre con Escape. Las pruebas buscan los elementos por rol y etiqueta, como un lector de pantalla.

## 7. Infraestructura (`infra`)

- **Stacks.** Viven en `infra/lib/` y se crean en `infra/bin/app.ts`, en orden: network, database, api y web. El stack de OIDC para GitHub se crea una sola vez con `infra/bin/bootstrap-oidc.ts`.
- **Valores por ambiente.** Tamaños, límites, tarifas y la frecuencia de la reconciliación van en `infra/lib/config/stage-config.ts`, no repartidos por los stacks.
- **cdk-nag.** Todos los stacks pasan `AwsSolutionsChecks`. Una supresión solo se acepta con su razón escrita en `NagSuppressions` (hay ejemplos en `web-stack.ts` y `database-stack.ts`).
- **Secretos fuera del código.** Las llaves de la pasarela van en SSM Parameter Store como `SecureString` (se cargan con `infra/scripts/put-parameters.sh`), y las credenciales generadas, en Secrets Manager. Los permisos IAM se limitan al prefijo del proyecto.
- **CSP.** El host de la pasarela llega por contexto de CDK (`-c pgHost=…`), desde una variable de GitHub, no desde el código.
- **Plan gratuito.** La cuenta usa el plan gratuito de AWS: tipos de instancia elegibles (`t4g.micro`) y región `us-east-1`.
- **Orden del deploy.** `.github/workflows/deploy.yml` publica el código antes de correr las migraciones; por eso deben ser *expand/contract*.

## 8. Pruebas

| Tipo | Dónde | Cómo |
|---|---|---|
| API unitarias | `apps/api/src/**/*.spec.ts`, junto al código | Builders de `apps/api/test/builders/` y dobles de `apps/api/test/fakes/`; sin base ni red |
| API integración | `apps/api/test/integration/` | PostgreSQL real |
| API e2e | `apps/api/test/e2e/` | La app Nest completa con supertest y una pasarela falsa |
| Web | `apps/web/src/**/*.test.ts(x)` | Jest y Testing Library; builders en `apps/web/test/builders.ts` |
| Infra | `infra/test/` | Afirmaciones sobre la plantilla de CDK y `cdk-nag` |

- Escribe primero la prueba del criterio de aceptación.
- La cobertura mínima es 85 % (80 % de ramas en `infra`). El CI falla por debajo.
- Nunca saltes, desactives ni borres una prueba para que el CI pase. Si una regla de negocio cambia a propósito, actualiza la prueba en el mismo commit.
- Los repositorios en memoria no ejecutan SQL. Una regla que vive en una consulta necesita una prueba de integración.
- Si cambia el número de pruebas, actualiza los conteos de `README.md`, `apps/api/README.md` y `apps/web/README.md`.

## 9. Seguridad del repositorio

- **Sin secretos.** Nunca subas `.env` ni llaves; `.env` está en `.gitignore`. Usa como plantilla `apps/api/.env.example` y `apps/web/.env.example`. El job `guards` del CI busca patrones de llaves de la pasarela y falla si encuentra uno.
- **Sin nombres comerciales.** No escribas el nombre de la pasarela ni el de la empresa evaluadora, ni sus URLs, en el código, los commits o la documentación. Se dice "payment gateway" o "PG", y la URL llega por configuración.
- **Logs.** Si un dato sensible nuevo puede aparecer en una petición o en un log, agrégalo a `REDACTED_PATHS` en `apps/api/src/shared/infrastructure/logging/logger.config.ts`.
- **Datos personales.** Las respuestas enmascaran el email y el teléfono (`apps/api/src/shared/infrastructure/http/masking.ts`).
- **Dependencias.** El job `audit` falla ante una vulnerabilidad alta en las dependencias de producción de la API y la web. `infra` se revisa a mano con `npm audit --omit=dev --workspace infra`, porque `aws-cdk-lib` solo corre al desplegar.

## 10. Git y pull requests

- **Commits.** Siguen Conventional Commits y los revisa commitlint (`commitlint.config.cjs`). Scopes permitidos: `api`, `web`, `infra`, `ci`, `specs`, `plans`, `docs`, `deps` y `repo`. Ejemplos: `feat(api): add inventory summary`, `fix(web): keep the quantity within stock`, `docs: record a new ADR`.
- **Hooks.** Husky corre commitlint y lint-staged (prettier) en cada commit. Los `.md` no pasan por prettier: se escriben a mano.
- **Un PR por cambio**, con la plantilla `.github/pull_request_template.md`. Se integra a `main` solo con el CI en verde.
- **`main` es producción.** Cada push a `main` despliega en AWS (`.github/workflows/deploy.yml`) y corre pruebas de humo contra la URL pública.
- **Decisiones y specs.** Una decisión de arquitectura nueva se documenta como ADR en `docs/adr/` (formato y lista en `docs/adr/README.md`). Un cambio al spec se registra en `docs/specs/CHANGELOG.md`.

## 11. Checklist antes de abrir un PR

- [ ] La prueba del cambio está escrita y pasa.
- [ ] Lint, typecheck y pruebas en verde en cada workspace tocado, más `depcruise` en la API, `stylelint` en la web y `synth` en infra.
- [ ] Ninguna invariante de pagos (sección 5) cambió sin un ADR.
- [ ] Contratos al día: DTO y respuesta en la API, contrato zod en la web y lista de rutas de OpenAPI.
- [ ] Si hay migración: es nueva, compatible hacia atrás, con `down()` y registrada.
- [ ] Sin secretos, sin datos de tarjeta y sin nombres comerciales.
- [ ] README, ADR o CHANGELOG actualizados si cambió el contrato, la arquitectura o los conteos de pruebas.
