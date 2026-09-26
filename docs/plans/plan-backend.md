# Plan de implementación — Backend (`apps/api`)

> Deriva de [`spec-backend.md`](../specs/spec-backend.md) v1.1. El spec define **qué** construir (contrato, modelo, reglas); este plan define **cómo** hacerlo: orden, diseño de código, patrones, librerías, tests y criterios de terminado por feature. Ante una contradicción manda el spec, y se corrige el plan.

---

## 0. Objetivo y reglas del juego

- Construir la API de checkout con **NestJS + TypeScript**, **arquitectura hexagonal (Ports & Adapters)** y **Railway Oriented Programming** en todos los casos de uso, cumpliendo cada requisito del enunciado y apuntando a los bonus de clean code, hexagonal, ROP y OWASP.
- **Test-first:** cada feature empieza escribiendo los tests de sus criterios de aceptación (spec §7), en rojo; luego la implementación mínima; luego el refactor.
- **Una feature = una rama `feat/be-<nn>-<slug>` desde `main` + un PR hacia `main`**, con commits convencionales pequeños (≈ 3–8 por feature). La prueba anula repositorios sin progreso visible.
- **Regla de nombres:** ni código, ni commits, ni docs, ni fixtures contienen el nombre de la compañía evaluadora. Se usa `PaymentGateway`/`PG`. Las URLs y llaves solo existen en `.env` local (ignorado por git), en SSM y en GitHub Secrets/Variables.

---

## 1. Lenguaje, runtime y librerías

| Área | Elección (versión mayor) | Uso concreto |
|---|---|---|
| Lenguaje | TypeScript 5.x, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `emitDecoratorMetadata`, `experimentalDecorators` | Tipos que impiden errores en montos y estados |
| Runtime | Node.js 24 LTS (`.nvmrc`), Lambda `nodejs24.x` arm64 | `AbortSignal.timeout/any`, `fetch` y `crypto` nativos |
| Framework | `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` 11 | DI, pipes, filtros y guards |
| Persistencia | `typeorm` 0.3 + `pg` 8 | Repositorios, `QueryRunner` para la unidad de trabajo, migraciones |
| Validación HTTP | `class-validator` + `class-transformer` | DTOs de entrada en la capa HTTP |
| Validación de fronteras | `zod` 4 | Variables de entorno (fail-fast) y respuestas de la pasarela (`unknown` → tipo) |
| Logs | `nestjs-pino` + `pino` (sin transports en Lambda; `pino-pretty` solo en dev) | JSON estructurado con `requestId` y `redact` |
| Seguridad | `helmet`, `@nestjs/throttler` 6 | Headers OWASP y rate limiting |
| Documentación | `@nestjs/swagger` 11 (plugin CLI con `introspectComments`) | OpenAPI 3 en `/api/docs` |
| Lambda | `@codegenie/serverless-express` 4, `@aws-sdk/client-ssm`, `@aws-sdk/client-secrets-manager` | Handler HTTP y carga de secretos |
| Utilidades | `ulid` | Referencias `TX-<ULID>` ordenables |
| Tests | `jest` 30, `ts-jest`, `supertest`, `@testcontainers/postgresql` | Unit, integración y e2e |
| Calidad | `eslint` 9 (flat config) + `typescript-eslint` (`strict-type-checked`, `stylistic-type-checked`), `eslint-plugin-import`, `prettier`, `dependency-cruiser`, `husky`, `lint-staged`, `@commitlint/config-conventional` | Clean code verificable en CI |
| Build | `@nestjs/cli` (tsc) + `esbuild` | Bundle Lambda en dos pasos (ADR-005) |

Criterio para añadir una dependencia: que resuelva algo que no se pueda escribir con claridad en < 50 líneas, que esté mantenida y que no traiga vulnerabilidades altas (`npm audit`). Por eso `Result`/`AsyncResult` son propios (bonus ROP, 100 % testeados) y no se usa `axios` (el `fetch` nativo basta).

---

## 2. Arquitectura y reglas de clean code

### 2.1 Capas y regla de dependencias

```
modules/<contexto>/
├── domain/          # entidades, value objects, reglas, puertos (interfaces), errores. TS puro.
├── application/     # casos de uso (una clase, un `execute`). Solo domain + shared/kernel.
└── infrastructure/  # adaptadores: http (controllers/DTOs), persistence (TypeORM), gateway (fetch)
shared/kernel/       # Result, AsyncResult, DomainError, Money, Clock, IdGenerator, Hasher, canonicalJson
shared/infrastructure/  # config, database, http transversal, logging
```

Decisión de este plan (más estricta que el spec y compatible con él): la capa `application` **no importa nada de `@nestjs/*`**. Los casos de uso son clases TypeScript puras y se registran en cada módulo con **factory providers**:

```ts
// modules/transactions/transactions.module.ts
{
  provide: CreateTransaction,
  inject: [TRANSACTION_REPOSITORY, PRODUCT_REPOSITORY, CUSTOMER_REPOSITORY, PAYMENT_GATEWAY, FEE_POLICY, UNIT_OF_WORK, CLOCK, REFERENCE_GENERATOR, HASHER],
  useFactory: (...deps: CreateTransactionDeps) => new CreateTransaction(...deps),
}
```

`dependency-cruiser` lo verifica en CI (`.dependency-cruiser.cjs`):

```js
forbidden: [
  { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  { name: 'domain-is-pure', severity: 'error',
    from: { path: '^src/(modules/[^/]+/domain|shared/kernel)' },
    to: { path: ['^src/.+/(application|infrastructure)/', '^node_modules/(@nestjs|typeorm|pg|zod|express)'] } },
  { name: 'application-no-infrastructure', severity: 'error',
    from: { path: '^src/modules/[^/]+/application' },
    to: { path: ['/infrastructure/', '^node_modules/(@nestjs|typeorm|pg|express)'] } },
  { name: 'modules-talk-through-ports', severity: 'error',
    from: { path: '^src/modules/([^/]+)/' },
    to: { path: '^src/modules/([^/]+)/infrastructure/', pathNot: '^src/modules/$1/' } },
]
```

### 2.2 Patrones y dónde se aplican

| Patrón | Dónde | Por qué |
|---|---|---|
| Ports & Adapters | Puertos en `domain/*.port.ts`, tokens `Symbol`, adaptadores en `infrastructure/` | Los casos de uso no conocen TypeORM ni `fetch`; se testean con fakes |
| Railway Oriented Programming | Todos los casos de uso devuelven `Promise<Result<T, E>>` compuestos con `AsyncResult` | Flujo de errores explícito y tipado, sin `try/catch` de negocio |
| Aggregate + máquina de estados | `Transaction` (solo `PENDING →` estado final) | Las transiciones inválidas son imposibles fuera del agregado |
| Value Object | `Money`, `Email`, `ColombianPhone`, `Reference`, `IdempotencyKey`, `Quantity` | Validación en la construcción; inmutables; igualdad por valor |
| Factory method | `Transaction.createPending`, `Money.of`, `Email.parse` | Constructores privados; toda instancia es válida |
| Repository | `ProductRepository`, `CustomerRepository`, `TransactionRepository`, `DeliveryRepository` | Colecciones de dominio, sin detalles de SQL |
| Unit of Work | `UnitOfWork.run(work)` sobre `QueryRunner` | Finalizar = 3 escrituras atómicas; rollback si el `Result` es `Err` |
| Strategy | `FeePolicy` → `FlatFeePolicy` | Cambiar el cálculo de envío sin tocar casos de uso |
| Decorator | `CachedAcceptanceProvider` envuelve el puerto de la pasarela | Caché de 5 min sin ensuciar el adaptador HTTP |
| Anti-Corruption Layer | `gateway.schemas.ts` (zod) + `gateway.mapper.ts` | El modelo de la pasarela (snake_case, estados, extras) no se filtra al dominio |
| Data Mapper | `*.mapper.ts` ORM ⇄ dominio ⇄ DTO | Las entidades ORM nunca salen de `infrastructure/` |
| Template de handler | `bootstrap/create-app.ts` compartido por `main.ts`, `lambda.ts` y los tests e2e | La app es idéntica en local, en Lambda y en tests |
| Test Data Builder / Fake | `test/builders`, `test/fakes` | Tests legibles y sin mocks frágiles |

### 2.3 Convenciones de código

- **Nombres:** archivos `kebab-case` con sufijo de rol (`create-transaction.use-case.ts`, `product.repository.port.ts`, `typeorm-product.repository.ts`, `products.controller.ts`, `create-transaction.dto.ts`). Clases en `PascalCase`, sin prefijos `I`. Dominio en inglés; mensajes de error técnicos en inglés (la UI traduce por `code`).
- **Funciones:** ≤ ~20 líneas, un nivel de abstracción; más de 3 parámetros → objeto con nombre. Casos de uso con un único método público `execute(command)`.
- **Inmutabilidad:** props `readonly`; los métodos de entidades devuelven instancias nuevas (`transaction.finalize(...)` no muta).
- **Tipos:** prohibido `any` (regla de lint); `unknown` + validación en fronteras; uniones discriminadas para estados y errores; `satisfies` para tablas de configuración; `assertNever` en `switch` exhaustivos.
- **Dinero:** siempre `Money` (centavos enteros); nada de `number` suelto para montos en dominio; sin `float`.
- **Errores:** los casos de uso **nunca lanzan** por reglas de negocio; `throw` solo para lo inesperado (bug, caída de DB), que el filtro global convierte en 500.
- **Config:** nada de `process.env` fuera de `env.schema.ts`; números con nombre (`PG_GET_TIMEOUT_MS`), nunca literales mágicos.
- **Comentarios:** explican el *porqué* (p. ej. la guardia optimista), no el *qué*.
- **Lint:** `@typescript-eslint/strict-type-checked`, `no-floating-promises`, `switch-exhaustiveness-check`, `import/no-cycle`, `max-lines-per-function` (warn a 30), `complexity` (warn a 8).

### 2.4 Kernel ROP (BE-01)

```ts
// shared/kernel/result.ts
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

// shared/kernel/async-result.ts
export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
  private constructor(private readonly promise: Promise<Result<T, E>>) {}

  static from<T, E>(source: Result<T, E> | PromiseLike<Result<T, E>>): AsyncResult<T, E> {
    return new AsyncResult(Promise.resolve(source));
  }

  map<U>(fn: (value: T) => U | Promise<U>): AsyncResult<U, E> {
    return new AsyncResult(this.promise.then(async (r) => (r.ok ? ok(await fn(r.value)) : r)));
  }

  andThen<U, F>(fn: (value: T) => Result<U, F> | PromiseLike<Result<U, F>>): AsyncResult<U, E | F> {
    return new AsyncResult<U, E | F>(this.promise.then((r) => (r.ok ? fn(r.value) : r)));
  }

  mapErr<F>(fn: (error: E) => F): AsyncResult<T, F> {
    return new AsyncResult(this.promise.then((r) => (r.ok ? r : err(fn(r.error)))));
  }

  tap(fn: (value: T) => void | Promise<void>): AsyncResult<T, E> {
    return this.map(async (v) => { await fn(v); return v; });
  }

  match<R>(onOk: (value: T) => R, onErr: (error: E) => R): Promise<R> {
    return this.promise.then((r) => (r.ok ? onOk(r.value) : onErr(r.error)));
  }

  then<A = Result<T, E>, B = never>(
    onfulfilled?: ((value: Result<T, E>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.promise.then(onfulfilled, onrejected);
  }
}
```

Más helpers sincrónicos para `Result` en `result.ts` (`map(result, fn)`, `andThen(result, fn)`, `mapErr(result, fn)`), `combine(results)` (todos ok → ok de la lista; primer `Err` gana) y `fromPredicate(value, predicate, onFalse)`. Tests de tabla que prueban que tras un `Err` ninguna función posterior se ejecuta (spies).

### 2.5 Del `Result` a HTTP

El controller no decide códigos de error: llama al caso de uso y entrega el `Result` a un helper de la frontera.

```ts
// shared/infrastructure/http/unwrap.ts
export function unwrapOrThrow<T>(result: Result<T, DomainError>): T {
  if (result.ok) return result.value;
  throw new DomainErrorException(result.error); // lo traduce ProblemDetailsFilter vía domain-error.http-mapper.ts
}

// modules/transactions/infrastructure/http/transactions.controller.ts
@Post()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
async create(
  @IdempotencyKeyHeader() idempotencyKey: string,
  @Body() body: CreateTransactionDto,
  @Res({ passthrough: true }) res: Response,
): Promise<TransactionResponseDto> {
  const outcome = unwrapOrThrow(await this.createTransaction.execute(toCommand(idempotencyKey, body)));
  res.status(outcome.kind === 'created' ? HttpStatus.CREATED : HttpStatus.OK);
  res.location(`/api/v1/transactions/${outcome.transaction.id}`);
  if (outcome.kind === 'replayed') res.setHeader('Idempotent-Replayed', 'true');
  return TransactionResponseDto.from(outcome.transaction);
}
```

`throw` aparece solo en la frontera HTTP, que es donde el framework lo espera; el dominio y la aplicación siguen libres de excepciones.

### 2.6 Convenciones de tests

- AAA, un comportamiento por test, nombre `should <resultado> when <condición>`.
- Builders: `aProduct().withStock(3).build()`, `aPendingTransaction().withTotal(163_000_00).build()`.
- Fakes en memoria que implementan los puertos (no `jest.mock` de módulos internos); `FixedClock`, `SequentialIdGenerator`, `FakePaymentGateway` configurable y espiable.
- `jest.spyOn(global, 'fetch')` solo en los tests del adaptador HTTP.
- Integración contra Postgres real (Testcontainers), un contenedor por archivo de test y `TRUNCATE` entre tests.
- Tests de tabla (`it.each`) para funciones puras (pricing, firma, checksum, máscaras, transformer).

---

## 3. Plan por features

Orden alineado con la hoja de ruta del overview. Cada feature indica rama, pasos, diseño clave, tests y commits sugeridos. Los criterios de aceptación completos están en el spec §7.

### BE-00 · Scaffolding y tooling — `feat/be-00-scaffolding`

**Pasos**
1. `npx @nestjs/cli new api --package-manager npm --strict --skip-git` dentro de `apps/`; limpiar el ejemplo (`app.controller/service`).
2. `tsconfig` estricto + path aliases `@shared/*`, `@modules/*` (y `moduleNameMapper` equivalente en Jest).
3. ESLint flat config, Prettier, Husky (`pre-commit`: lint-staged; `commit-msg`: commitlint).
4. `jest.config.ts` con `projects` (`unit`: `src/**/*.spec.ts`; `integration`: `test/integration/**/*.int-spec.ts`; `e2e`: `test/e2e/**/*.e2e-spec.ts`) y umbral global 85 %.
5. `shared/infrastructure/config/env.schema.ts` con zod (tipos, defaults, `z.coerce.number().int().positive()`, refinamiento: `ORIGIN_VERIFY_SECRET` obligatorio cuando `APP_ENV=aws`) + `AppConfigService` con getters agrupados (`pg`, `fees`, `db`, `http`, `reconcile`).
6. `HealthModule` con `GET /api/v1/health` (`enableVersioning({ type: VersioningType.URI })`, prefijo global `api`).
7. `docker-compose.yml` (Postgres 16 con healthcheck), `.env.example`, `.nvmrc`, `.dependency-cruiser.cjs`.

**Tests:** el schema de env rechaza variables faltantes o mal tipadas con un mensaje que nombra la variable; e2e de health.

**Commits:** `chore(api): scaffold nest application` · `chore(api): configure strict lint, format and commit hooks` · `feat(api): validate environment with zod at startup` · `feat(api): add health endpoint` · `chore(api): add docker compose and dependency rules`.

### BE-01 · Kernel ROP y HTTP transversal — `feat/be-01-shared-kernel`

**Pasos**
1. Tests primero de `Result`, `AsyncResult`, `combine` (100 %).
2. `Money` (`of(cents, currency)` → `Result`; `add`, `multiply(quantity)`; error si difieren las monedas), `DomainError`, `assertNever`, puertos `Clock`, `IdGenerator`, `Hasher`, función pura `canonicalJson` (llaves ordenadas en profundidad).
3. `ProblemDetailsFilter` (RFC 9457, `type: about:blank`, `code`, `requestId`, `instance`), `DomainErrorException`, `domain-error.http-mapper.ts` exhaustivo, `unwrapOrThrow`.
4. `request-id.middleware.ts` (acepta `x-request-id` si es un UUID válido; si no, genera uno) y `genReqId` de pino.
5. `nestjs-pino` con `redact` (`req.headers.authorization`, `req.headers["x-origin-verify"]`, `*.cardToken`, `*.email`, `*.phone`, `*.acceptanceToken`, `*.acceptPersonalAuth`) y `censor: '[REDACTED]'`.
6. `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) con `exceptionFactory` → `VALIDATION_ERROR` + `details: [{ field, message }]`.

**Tests:** unitarios del kernel y del mapper (un caso por código); e2e: excepción inesperada → 500 sin stack; campo extra → 400 con el detalle del campo; `x-request-id` presente en la respuesta y en el problem.

### BE-02 · Persistencia, migraciones y seed — `feat/be-02-persistence`

**Pasos**
1. `data-source.ts` exportando un `DataSourceOptions` único para la app y para la CLI; `entities: [ProductOrmEntity, …]` y `migrations: [InitialSchema1700000000000]` como arrays de clases; `poolSize`/`extra.max` desde `DB_POOL_MAX`; `ssl` con `ca` cuando `DB_SSL_CA_PATH` existe.
2. `bigint.transformer.ts` + test de tabla (C-05).
3. Migración inicial escrita a mano y revisada: `CREATE EXTENSION IF NOT EXISTS citext`, enums `transaction_status` y `delivery_status`, `CHECK`s de montos y stock, índices y uniques del ER (spec §4.1).
4. `UnitOfWork` (puerto en `shared/kernel`) + `TypeOrmUnitOfWork`. El trabajo recibe un `TransactionContext` **opaco** que los casos de uso pasan a los métodos de repositorio que deben participar en la transacción; solo los adaptadores saben que adentro hay un `EntityManager` (`managerFor(dataSource, tx)`). Así ningún módulo importa adaptadores de otro:
   ```ts
   async run<T, E>(work: (tx: TransactionContext) => Promise<Result<T, E>>): Promise<Result<T, E>> {
     const runner = this.dataSource.createQueryRunner();
     await runner.connect();
     await runner.startTransaction();
     try {
       const result = await work(contextFor(runner.manager));
       await (result.ok ? runner.commitTransaction() : runner.rollbackTransaction());
       return result;
     } catch (error) {
       await runner.rollbackTransaction();
       throw error;
     } finally {
       await runner.release();
     }
   }
   ```
5. Seed idempotente (`INSERT … ON CONFLICT (sku) DO UPDATE`), 5 productos con `image_key`, precios moderados en centavos y stock variado, uno con stock 0. Scripts `migration:run`, `migration:revert`, `seed`, `db:reset` (solo local).

**Tests (integración):** migrar + sembrar dos veces → mismos 5 productos; `Err` dentro del UoW → rollback verificado consultando la tabla; `throw` dentro del UoW → rollback y propagación; montos leídos son `number`.

### BE-03 · Products y stock — `feat/be-03-products`

**Pasos:** `Product` (constructor privado, `Product.restore(props)`, `hasStock(quantity)`), puerto `ProductRepository` (`findAll(limit)`, `findById(id)`), casos de uso `ListProducts`, `GetProduct`, `GetProductStock`; `ProductsController` con `ParseUUIDPipe({ version: '4' })`, `ListProductsQueryDto` (`limit` 1–50, default 20), DTOs de respuesta con `@ApiProperty`, interceptor `NoStoreInterceptor` (`Cache-Control: no-store`).

**Tests:** unit de casos de uso con `InMemoryProductRepository`; integración del repo TypeORM; e2e: lista, 404 problem+json, 400 por id inválido, `/stock`.

### BE-04 · Pricing y quote — `feat/be-04-checkout-quote`

**Diseño**
```ts
export interface FeePolicy { feesFor(order: OrderDraft): { baseFee: Money; deliveryFee: Money } }

export const priceOrder = (product: Product, quantity: Quantity, fees: FeePolicy): Result<OrderAmounts, DomainError> =>
  andThen(product.price.multiply(quantity.value), (productAmount) => {
    const { baseFee, deliveryFee } = fees.feesFor({ product, quantity });
    return map(Money.sum(productAmount, baseFee, deliveryFee), (total) => ({ productAmount, baseFee, deliveryFee, total }));
  });
```
(`andThen`/`map` son los helpers sincrónicos de `result.ts`; `Result` es un tipo plano sin métodos.)
`GetQuote` = `loadProduct → ensureStockAvailable → priceOrder`. `QuoteQueryDto` (`productId` UUID v4, `quantity` entero 1–10).

**Tests:** tabla de `priceOrder` (1 y N unidades; el total es la suma exacta); quantity > stock → 409; producto inexistente → 404.

### BE-05 · Customers — `feat/be-05-customers`

**Pasos:** VOs `Email` (trim + lowercase + formato) y `ColombianPhone` (`^3\d{9}$`); `Customer`; puerto `CustomerRepository.upsertByEmail(draft)` → `{ customer, created: boolean }` (`INSERT … ON CONFLICT (email) DO UPDATE … RETURNING (xmax = 0) AS created`); `RegisterCustomer` y `GetCustomer`; `maskEmail` y `maskPhone` puras en el mapper de respuesta.

**Tests:** tabla de máscaras; mismo email con distinto casing → un registro y 200 en el segundo POST; `Location` en el 201; GET nunca expone datos completos.

### BE-06 · Adaptador de la pasarela + acceptance — `feat/be-06-payment-gateway`

**Pasos**
1. **Spike** (`scripts/pg-smoke.ts`, ejecutado a mano con `.env` local): merchants, tokenización `4242…`, creación APPROVED y `4111…` DECLINED, consulta por id y por referencia. Guardar las respuestas reales (sin llaves) en `test/fixtures/pg/*.json` y confirmar el formato de teléfonos (I-19).
2. Puerto `PaymentGatewayPort` (spec §6.2) y tipos de dominio `GatewayTransaction`, `AcceptanceTokens`.
3. `gateway.schemas.ts` (zod) derivados de las fixtures; `gateway.mapper.ts` (estado desconocido → PENDING + `warn`).
4. `HttpPaymentGatewayAdapter` con un único método privado de transporte:
   ```ts
   private async send<T>(req: GatewayRequest, schema: z.ZodType<T>): Promise<Result<T, GatewayError>> {
     const attempts = req.method === 'GET' ? 1 + this.cfg.getMaxRetries : 1;
     const deadline = AbortSignal.timeout(this.cfg.deadlineMs);
     for (let attempt = 1; attempt <= attempts; attempt++) {
       const result = await this.attempt(req, schema, AbortSignal.any([deadline, AbortSignal.timeout(req.timeoutMs)]));
       if (result.ok || !isRetryable(result.error) || deadline.aborted || attempt === attempts) return result;
       await sleep(backoffWithJitter(attempt));
     }
     return err({ code: 'GATEWAY_UNAVAILABLE', cause: 'TIMEOUT' });
   }
   ```
   `attempt` traduce: `AbortError`/`TimeoutError` → `TIMEOUT`; `TypeError` de red → `NETWORK`; 5xx → `HTTP_5XX`; 4xx → `GATEWAY_REJECTED` con el motivo del body; JSON inválido o schema zod fallido → `GATEWAY_UNAVAILABLE` (se loguea el problema, no el body).
5. `integrity-signature.ts` y `event-checksum.ts` (funciones puras sobre `node:crypto`; `timingSafeEqual` con guarda de longitud).
6. `CachedAcceptanceProvider` (decorador con TTL y `Clock` inyectado) + `GetAcceptance` + `GET /api/v1/checkout/acceptance`.
7. `FakePaymentGateway` en `test/fakes` con escenarios `approved`, `declined`, `timeout`, `rejected`, `amountMismatch` y contadores de llamadas.

**Tests:** los de aceptación del spec (fetch mockeado) + deadline con fake timers + vector conocido de firma y de checksum.

### BE-07 · Crear transacción — `feat/be-07-create-transaction`

**Diseño del caso de uso (ROP)**
```ts
execute(cmd: CreateTransactionCommand): Promise<Result<CreateTransactionOutcome, CreateTransactionError>> {
  const fingerprint = this.hasher.sha256(canonicalJson(purchaseIntentOf(cmd))); // sin cardToken ni acceptance (ADR-006)
  return AsyncResult.from(this.transactions.findByIdempotencyKey(cmd.idempotencyKey))
    .andThen((existing) =>
      existing
        ? replay(existing, fingerprint)           // ok({ kind: 'replayed' }) | err(IDEMPOTENCY_CONFLICT)
        : this.createAndCharge(cmd, fingerprint)); // ok({ kind: 'created' })
}

private createAndCharge(cmd: CreateTransactionCommand, fingerprint: string) {
  return AsyncResult.from(this.loadProduct(cmd))
    .andThen((ctx) => ensureStockAvailable(ctx))
    .andThen((ctx) => this.price(ctx))
    .andThen((ctx) => this.loadCustomer(ctx))
    .andThen((ctx) => this.persistPending(ctx, fingerprint)) // commit ANTES de cobrar; unique violation → replay
    .andThen((ctx) => this.charge(ctx))                      // 4xx → ERROR; timeout/5xx → sigue PENDING
    .map((tx) => ({ kind: 'created' as const, transaction: toView(tx) }));
}
```
- `Transaction.createPending` valida invariantes (quantity > 0, total = suma de componentes, moneda COP).
- `ReferenceGenerator` → `TX-${ulid()}`.
- Decorador de parámetro `@IdempotencyKeyHeader()` que valida UUID v4 (400 si falta o es inválido).
- `GET /api/v1/transactions?idempotencyKey=` → `FindTransactionByIdempotencyKey` (404 si no existe).
- El `cardToken` solo vive en el comando y en la llamada a la pasarela: nunca se persiste ni se loguea.
- El límite de 10 req/min/IP de `POST /transactions` se activa en BE-11, junto con el throttler global y el tracker `CloudFront-Viewer-Address` (I-01): antes de eso, detrás de CloudFront contaría la IP del edge y no la del cliente.

**Tests:** los cinco escenarios del spec + otro token con la misma key (replay sin segundo cobro) + otra cantidad (422) + concurrencia real (integración: dos `execute` en `Promise.all` → una fila, una llamada al fake).

### BE-08 · Sincronización y finalización — `feat/be-08-sync-finalize`

**Diseño**
- `SyncTransactionStatus`: `load → (isFinal ? ok(tx) : fetchFromGateway) → (isFinal(gatewayStatus) ? finalize : ok(tx))`.
- `FinalizeTransaction` dentro de `UnitOfWork.run`:
  1. `ensureConsistent(tx, gatewayTx)` → si difieren `reference`/monto/moneda, el resultado es ERROR `AMOUNT_MISMATCH` (I-06).
  2. `transactions.finalizeIfPending(...)` → `UPDATE … WHERE id = $1 AND status = 'PENDING'`; `affected === 0` → `ok({ alreadyFinalized: true })` sin más efectos.
  3. Si APPROVED: `products.decrementStockIfAvailable(productId, quantity)` (`UPDATE … SET stock = stock - $q WHERE id = $p AND stock >= $q`) → `Delivery.assign(...)` o `Delivery.backorder(...)` (+ `warn`) → `deliveries.save`.
- `GET /api/v1/transactions/:id` usa `SyncTransactionStatus` y devuelve `deliveryId`.

**Tests:** unit de cada rama; integración: APPROVED decrementa exactamente `quantity` y crea 1 delivery; DECLINED no toca stock; dos finalizaciones concurrentes → un decremento y una delivery; `AMOUNT_MISMATCH` → ERROR sin delivery.

### BE-09 · Deliveries — `feat/be-09-deliveries`

`Delivery` (ASSIGNED | BACKORDERED), `GetDelivery`, `GET /api/v1/deliveries/:id` con teléfono enmascarado. Tests: 404, shape, máscara.

### BE-10 · Webhook de eventos — `feat/be-10-payment-events`

`PaymentEventDto` (valida solo la envoltura; el `data` se valida con zod en la aplicación), `HandlePaymentEvent` (`verifyChecksum → ignore si no es transaction.updated → findByReference → FinalizeTransaction`), `@SkipThrottle()`, límite de body de 32 KB solo en esta ruta. Tests: checksum inválido → 401 sin cambios; duplicado → 200; otro tipo de evento → 200 no-op.

### BE-14 · Reconciliación programada — `feat/be-14-reconciliation`

`TransactionRepository.findPendingOlderThan(cutoff, limit)`, `ReconcilePendingTransactions` (reutiliza `SyncTransactionStatus`; procesa en serie para no saturar el pool; captura errores por transacción y los cuenta en `failed`), regla de expiración a ERROR `EXPIRED_WITHOUT_GATEWAY_RECORD`, handler `reconcile.ts`. Tests: los cuatro escenarios del spec (fake gateway + `FixedClock`) y un test del handler.

### BE-11 · Hardening OWASP — `feat/be-11-security-hardening`

`helmet` (API: CSP `default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS; una configuración propia para `/api/docs`), CORS allowlist desde config, `AppThrottlerGuard extends ThrottlerGuard` con `getTracker` = `client-ip.tracker.ts` (I-01), `OriginVerifyGuard` (C-06), límites de body globales (16 KB), `docs/security/README.md` con el mapeo OWASP API Top 10 del spec §9. Tests e2e: headers presentes, 429, 403 sin `X-Origin-Verify` con `APP_ENV=aws`.

### BE-12 · Handlers Lambda y build — `feat/be-12-lambda-handlers`

```ts
// src/lambda.ts
let handlerPromise: Promise<Handler> | undefined;

export const handler: Handler = async (event, context) => {
  handlerPromise ??= createLambdaHandler();
  return (await handlerPromise)(event, context);
};

async function createLambdaHandler(): Promise<Handler> {
  await loadSecretsIntoEnv();            // SSM + Secrets Manager, una sola vez por contenedor
  const app = await createApp();          // bootstrap/create-app.ts (mismo que main.ts y e2e)
  await app.init();
  return serverlessExpress({ app: app.getHttpAdapter().getInstance() });
}
```
- `migrate.ts` y `reconcile.ts` con `NestFactory.createApplicationContext(WorkerModule)` (sin HTTP).
- `scripts/bundle-lambda.mjs` según spec BE-12 (tsc → esbuild, externals, copia de `swagger-ui-dist` y del bundle CA); script `build:lambda`.
- Tests: evento API Gateway v2 simulado → 200 en health; `loadSecretsIntoEnv` con clientes AWS falsos; smoke `require('./dist-lambda/lambda.js')` en CI.

### BE-13 · Documentación y reporte — `feat/be-13-api-docs`

Swagger completo (ejemplos de éxito y de cada problem), colección Postman `docs/postman/checkout-api.postman_collection.json` (variables `baseUrl`, `idempotencyKey` generado en pre-request; flujos aprobado, rechazado, idempotencia, errores de validación), sección backend del README (arquitectura, ER, máquina de estados, endpoints, cómo correr, tabla de cobertura).

---

## 4. Checklist de cumplimiento del enunciado (backend)

| Requisito | Dónde |
|---|---|
| API en NestJS con TypeScript | BE-00 |
| Lógica de negocio fuera de controllers; Hexagonal + Ports & Adapters | §2.1–2.2, dependency-cruiser |
| ROP en casos de uso | §2.4, todos los casos de uso |
| Recursos stock, transactions, customers, deliveries con distintos tipos de request | BE-03, BE-05, BE-07–BE-09 (GET/POST, 200/201/4xx/5xx, headers de idempotencia) |
| Transacción PENDING propia con número y cobro en la pasarela | BE-07 |
| Al finalizar: actualizar transacción, asignar entrega, actualizar stock | BE-08, BE-10, BE-14 |
| Validaciones pensando en casos reales | DTOs + VOs + idempotencia + stock + invariante de montos + timeouts |
| Manejo seguro de datos sensibles | Tokenización en el cliente, redact, sin PAN/CVC/token en DB ni logs, secretos en SSM |
| DB sembrada, sin endpoint de creación de productos | BE-02 |
| Modelo de datos y Swagger/Postman en README | BE-13 |
| Jest > 80 % | Umbral 85 % en CI |
| Sandbox, sin dinero real | BE-06 (URL de sandbox, I-09) |

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Forma real de las respuestas de la sandbox distinta a la documentada | Spike de BE-06 con fixtures reales antes de fijar los schemas zod |
| Sandbox compartida lenta o caída durante la evaluación | Timeouts y deadline; PENDING + reconciliación en lugar de fallar; mensajes claros en el front |
| Cold start alto (Nest + TypeORM + VPC) | App cacheada por contenedor, bundle minificado, 1024 MB; health como calentamiento en el smoke test |
| Conexiones agotadas en RDS micro | Pool `max: 2`, throttling de API Gateway, reconciliación en serie |
| Cobertura bajo el umbral por código de infraestructura | Adaptadores delgados, tests de integración de repos, exclusiones mínimas y justificadas |

## 6. Definition of Done (todas las features)

- [ ] Tests de los criterios de aceptación escritos primero y en verde; cobertura global ≥ 85 %.
- [ ] `npm run lint`, `npm run typecheck`, `npm run depcruise` y `npm run build` sin errores.
- [ ] Swagger actualizado si cambió el contrato; ADR si se tomó una decisión nueva.
- [ ] Sin secretos, sin el nombre de la compañía y sin datos de tarjeta en código, fixtures o logs.
- [ ] PR con plantilla completa y CI en verde antes del merge a `main`.
