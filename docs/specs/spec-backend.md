# Spec Backend — Checkout API

> **Versión 1.1** — incorpora las correcciones de la revisión (ver [`CHANGELOG.md`](./CHANGELOG.md); los IDs `C-xx`/`I-xx`/`M-xx` citados abajo remiten a ese registro).

> **Regla de nombres:** este repositorio es público y **no puede contener el nombre de la compañía evaluadora**. En código, variables, commits y docs se usa siempre el término neutro **Payment Gateway (PG)** / "pasarela". Las URLs y llaves reales viven solo en variables de entorno / SSM, nunca en el repo.

---

## 0. Contexto y alcance

API REST que soporta el onboarding de compra de un producto pagado con tarjeta de crédito a través de la pasarela (sandbox):

1. Exponer productos con su stock (seeded, sin endpoint de creación).
2. Registrar clientes y datos de entrega.
3. Crear una transacción **PENDING** propia, obtener su número/referencia y cobrar a través de la pasarela.
4. Al llegar a un estado final (APPROVED / DECLINED / VOIDED / ERROR): actualizar la transacción y, si fue APPROVED, **asignar la entrega** al cliente y **descontar stock**.
5. Garantizar que toda transacción PENDING llegue a un estado final aunque el cliente abandone la página (reconciliación programada, BE-14).

Recursos obligatorios según la prueba: **stock (products), transactions, customers, deliveries**, con distintos tipos de request (GET/POST).

Fuera de alcance: autenticación de usuarios finales, anulaciones/reembolsos, CRUD de productos.

---

## 1. Stack y librerías

| Tema | Elección | Motivo |
|---|---|---|
| Runtime | Node.js 24 LTS (Lambda `nodejs24.x`, arm64) — I-08 | Active LTS con soporte hasta abr-2028 (Node 22 termina en abr-2027); solo handlers async |
| Lenguaje | TypeScript `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `emitDecoratorMetadata` | Tipado fuerte = menos bugs en montos/estados |
| Framework | **NestJS 11** | Permitido por la prueba; DI nativa para puertos/adaptadores |
| DB | **PostgreSQL 16** (RDS) | Transacciones ACID para stock + estado de pago |
| ORM | **TypeORM 0.3** + `pg` + migraciones explícitas (`synchronize: false`); entidades y migraciones registradas como **arrays de clases**, nunca globs (I-15) | Integración Nest, `QueryRunner` para unidad de trabajo; los globs no existen dentro de un bundle |
| Validación de entrada | `class-validator` + `class-transformer` (DTOs en capa HTTP) | Estándar Nest; `whitelist` + `forbidNonWhitelisted` |
| Validación de config | `zod` 4 | Fail-fast al arrancar si falta una variable |
| ROP | `Result<T,E>` / `AsyncResult<T,E>` propios en `shared/kernel` (alternativa aceptable: `neverthrow`) | Bonus ROP; errores tipados sin `throw` |
| HTTP saliente | `fetch` nativo + `AbortController` (timeouts) | Sin dependencias extra |
| Logs | `nestjs-pino` con `redact` | JSON estructurado, sin PII/datos de tarjeta |
| Seguridad | `helmet`, `@nestjs/throttler`, CORS allowlist | OWASP / bonus headers |
| Docs API | `@nestjs/swagger` (OpenAPI 3) + colección Postman exportada | Requisito README |
| Lambda | `@codegenie/serverless-express` (handler que reutiliza la app Nest cacheada) | Mismo `AppModule` local y en Lambda |
| Build Lambda | `nest build` (tsc + plugin de Swagger) → **esbuild sobre el JS compilado** (`scripts/bundle-lambda.mjs`) — C-01, ADR-005 | esbuild no soporta `emitDecoratorMetadata`; sin ese metadata la DI de Nest, `@ValidateNested/@Type` y Swagger fallan |
| Secretos en Lambda | `@aws-sdk/client-ssm` + `@aws-sdk/client-secrets-manager` (carga única en *cold start*) | Llaves de la pasarela, credenciales de DB y secreto de origen fuera del código |
| IDs | UUID v4 (entidades), ULID (`ulid`) para referencia de pago | No enumerables; referencia ordenable |
| Tests | **Jest** + `ts-jest`, `supertest`, `@testcontainers/postgresql` | Requisito Jest; integración real contra Postgres |
| Calidad | ESLint (typescript-eslint strict), Prettier, `dependency-cruiser`, Husky + lint-staged + commitlint | Clean code verificable en CI |

---

## 2. Principios de arquitectura

### 2.1 Hexagonal (Ports & Adapters)

```
          ┌─────────────── infrastructure (adapters) ───────────────┐
          │  HTTP controllers/DTOs   TypeORM repos   PG HTTP client │
          │            │                  ▲                ▲        │
          │            ▼                  │                │        │
          │   ┌──────── application (use cases) ────────┐  │        │
          │   │   depende SOLO de puertos (interfaces)  │──┘        │
          │   │   ┌──────────── domain ─────────────┐   │           │
          │   │   │ entidades, value objects, reglas│   │           │
          │   │   │ puertos, errores de dominio     │   │           │
          │   │   └─────────────────────────────────┘   │           │
          │   └─────────────────────────────────────────┘           │
          └─────────────────────────────────────────────────────────┘
```

Reglas (verificadas con `dependency-cruiser` en CI):

- `domain/` **no importa** nada de Nest, TypeORM, `fetch` ni de otras capas.
- `application/` importa solo `domain/` y `shared/kernel`. Nada de decoradores de Nest excepto `@Injectable()` e `@Inject(TOKEN)` (aceptado como pegamento de DI).
- `infrastructure/` implementa puertos y es la única capa que conoce frameworks.
- Controllers **no contienen lógica de negocio**: validan DTO → llaman al caso de uso → mapean `Result` a HTTP.
- Los puertos se inyectan por **tokens** (`export const PRODUCT_REPOSITORY = Symbol('ProductRepository')`).

### 2.2 Railway Oriented Programming

Cada caso de uso devuelve `Promise<Result<Output, DomainError>>`. Los pasos se encadenan con `andThen` / `map` / `mapErr` / `tap`; el primer error "desvía el tren" y los siguientes pasos no se ejecutan. `throw` queda reservado para errores **inesperados** (bugs, caída de DB), capturados por el filtro global → 500.

```ts
// shared/kernel/result.ts (resumen de la API esperada)
export type Result<T, E> = Ok<T> | Err<E>;
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export class AsyncResult<T, E> implements PromiseLike<Result<T, E>> {
  static from<T, E>(r: Result<T, E> | Promise<Result<T, E>>): AsyncResult<T, E>;
  map<U>(fn: (v: T) => U | Promise<U>): AsyncResult<U, E>;
  andThen<U, F>(fn: (v: T) => Result<U, F> | Promise<Result<U, F>> | AsyncResult<U, F>): AsyncResult<U, E | F>;
  mapErr<F>(fn: (e: E) => F): AsyncResult<T, F>;
  tap(fn: (v: T) => void | Promise<void>): AsyncResult<T, E>;
  match<R>(onOk: (v: T) => R, onErr: (e: E) => R): Promise<R>;
}
```

Ejemplo de caso de uso (forma objetivo):

```ts
execute(cmd: CreateTransactionCommand): Promise<Result<TransactionView, CreateTransactionError>> {
  return AsyncResult.from(this.idempotency.check(cmd))
    .andThen((c) => this.loadProduct(c))
    .andThen(ensureStockAvailable)
    .map((c) => priceOrder(c, this.feePolicy))
    .andThen((c) => this.loadCustomer(c))
    .andThen((c) => this.persistPending(c))
    .andThen((c) => this.chargeThroughGateway(c))
    .map(toTransactionView);
}
```

### 2.3 Errores de dominio

Unión discriminada, nunca strings sueltos:

```ts
export type DomainError =
  | { code: 'VALIDATION_ERROR'; details: FieldError[] }
  | { code: 'PRODUCT_NOT_FOUND'; productId: string }
  | { code: 'CUSTOMER_NOT_FOUND'; customerId: string }
  | { code: 'TRANSACTION_NOT_FOUND'; transactionId: string }
  | { code: 'DELIVERY_NOT_FOUND'; deliveryId: string }
  | { code: 'INSUFFICIENT_STOCK'; available: number; requested: number }
  | { code: 'IDEMPOTENCY_CONFLICT' }
  | { code: 'INVALID_STATE_TRANSITION'; from: TransactionStatus; to: TransactionStatus }
  | { code: 'INVALID_EVENT_SIGNATURE' }
  | { code: 'GATEWAY_UNAVAILABLE' }
  | { code: 'GATEWAY_REJECTED'; reason: string };
```

Un único `domain-error.http-mapper.ts` traduce a HTTP + `application/problem+json` (**RFC 9457**, que reemplaza a RFC 7807 — I-04). El mapper es exhaustivo: una tabla tipada con un *mapped type* (`{ [C in DomainErrorCode]: … }`), de modo que agregar un código sin mapearlo rompe el typecheck.

| code | HTTP |
|---|---|
| VALIDATION_ERROR | 400 |
| PRODUCT/CUSTOMER/TRANSACTION/DELIVERY_NOT_FOUND | 404 |
| INSUFFICIENT_STOCK, INVALID_STATE_TRANSITION | 409 |
| IDEMPOTENCY_CONFLICT | 422 |
| INVALID_EVENT_SIGNATURE | 401 |
| GATEWAY_REJECTED | 502 (la pasarela rechazó una operación que no es el cobro, p. ej. obtener tokens de aceptación) — I-03 |
| GATEWAY_UNAVAILABLE | 503 + header `Retry-After: 5` — I-03 |
| (no mapeado / excepción) | 500 sin stack ni detalles internos |

> En `POST /transactions` los rechazos de la pasarela **no** llegan a este mapper: el recurso sí se crea y queda en ERROR (ver §5.2).

### 2.4 Clean code — reglas concretas

- Funciones ≤ ~20 líneas, un nivel de abstracción; casos de uso con un solo método público `execute`.
- Montos **siempre en enteros de centavos** (`amountInCents: number` validado como entero seguro) mediante el value object `Money`; nunca `float`.
- Sin "magic numbers": fees, timeouts, TTLs en config tipada.
- Nombres de dominio en inglés (`Transaction`, `Delivery`), mensajes de UI en español solo en el frontend.
- Mappers explícitos `ORM entity ⇄ domain entity ⇄ DTO`; las entidades ORM nunca salen de `infrastructure/`.
- Nada de `any`; `unknown` + type guards en fronteras (respuestas de la pasarela).

---

## 3. Estructura de carpetas

```
apps/api/
├── src/
│   ├── main.ts                      # bootstrap HTTP local
│   ├── lambda.ts                    # handler Lambda API (reutiliza AppModule)
│   ├── migrate.ts                   # handler Lambda: migraciones + seed (invocado desde CD)
│   ├── reconcile.ts                 # handler Lambda programado: reconciliación de PENDING (BE-14)
│   ├── app.module.ts
│   ├── bootstrap/                   # secrets-loader.ts (SSM/Secrets Manager → env), create-app.ts (config compartida de Nest)
│   ├── shared/
│   │   ├── kernel/                  # result.ts, async-result.ts, domain-error.ts, money.ts, clock.port.ts, id-generator.port.ts, assert-never.ts
│   │   └── infrastructure/
│   │       ├── config/              # env.schema.ts (zod), app-config.service.ts
│   │       ├── database/            # data-source.ts, typeorm-unit-of-work.ts, bigint.transformer.ts, migrations/, seeds/
│   │       ├── http/                # problem-details.filter.ts, domain-error.http-mapper.ts, request-id.middleware.ts, origin-verify.guard.ts, client-ip.tracker.ts
│   │       └── logging/             # pino config con redact
│   └── modules/
│       ├── products/
│       │   ├── domain/              # product.ts, product.repository.port.ts
│       │   ├── application/         # list-products.use-case.ts, get-product.use-case.ts
│       │   └── infrastructure/
│       │       ├── persistence/     # product.orm-entity.ts, typeorm-product.repository.ts, product.mapper.ts
│       │       └── http/            # products.controller.ts, dto/
│       ├── checkout/                # pricing: fee-policy.port.ts, flat-fee.policy.ts, get-quote.use-case.ts, acceptance
│       ├── customers/
│       ├── transactions/
│       │   ├── domain/              # transaction.ts (state machine), transaction-status.ts, payment-gateway.port.ts, ...
│       │   ├── application/         # create-transaction, sync-transaction-status, finalize-transaction, handle-payment-event, find-by-idempotency-key, reconcile-pending-transactions
│       │   └── infrastructure/
│       │       ├── gateway/         # http-payment-gateway.adapter.ts, integrity-signature.ts, event-checksum.ts, gateway.mapper.ts
│       │       ├── persistence/
│       │       └── http/            # transactions.controller.ts, payment-events.controller.ts
│       └── deliveries/
├── test/
│   ├── fakes/                       # in-memory repos, FakePaymentGateway, FixedClock
│   ├── integration/                 # repos contra Postgres (Testcontainers)
│   └── e2e/                         # supertest sobre la app completa
├── scripts/bundle-lambda.mjs        # esbuild sobre dist/ → dist-lambda/ (C-01)
├── certs/global-bundle.pem          # bundle CA público de RDS (TLS verificado)
├── jest.config.ts
└── .dependency-cruiser.cjs
```

---

## 4. Modelo de dominio y datos

### 4.1 Diagrama ER (incluir en README)

```mermaid
erDiagram
  PRODUCTS ||--o{ TRANSACTIONS : "is bought in"
  CUSTOMERS ||--o{ TRANSACTIONS : "pays"
  TRANSACTIONS ||--o| DELIVERIES : "results in"
  CUSTOMERS ||--o{ DELIVERIES : "receives"
  PRODUCTS {
    uuid id PK
    varchar sku UK
    varchar name
    text description
    bigint price_in_cents "CHECK > 0"
    char3 currency "COP"
    int stock "CHECK >= 0"
    varchar image_key "slug de las variantes de imagen"
    timestamptz created_at
    timestamptz updated_at
  }
  CUSTOMERS {
    uuid id PK
    citext email UK
    varchar full_name
    varchar phone
    timestamptz created_at
    timestamptz updated_at
  }
  TRANSACTIONS {
    uuid id PK
    varchar reference UK "TX-<ULID>, nro. visible"
    uuid product_id FK
    uuid customer_id FK
    int quantity "CHECK > 0"
    bigint product_amount_in_cents
    bigint base_fee_in_cents
    bigint delivery_fee_in_cents
    bigint total_amount_in_cents
    char3 currency
    enum status "PENDING|APPROVED|DECLINED|VOIDED|ERROR"
    varchar status_message
    varchar gateway_transaction_id UK "nullable"
    varchar card_brand "nullable"
    varchar card_last_four "nullable"
    smallint installments
    uuid idempotency_key UK
    char64 request_hash
    jsonb shipping_snapshot
    timestamptz finalized_at
    timestamptz created_at
    timestamptz updated_at
  }
  DELIVERIES {
    uuid id PK
    uuid transaction_id FK, UK
    uuid customer_id FK
    uuid product_id FK
    int quantity
    varchar recipient_name
    varchar recipient_phone
    varchar address_line_1
    varchar address_line_2
    varchar city
    varchar region
    char2 country
    varchar postal_code
    enum status "ASSIGNED|BACKORDERED"
    timestamptz created_at
  }
```

Índices: `transactions(status, created_at)` (lo usa también la reconciliación de BE-14), `transactions(customer_id)`, únicos indicados arriba. `CHECK (total_amount_in_cents = product_amount_in_cents + base_fee_in_cents + delivery_fee_in_cents)`.

Detalles de mapeo:

- **`bigint` → `number` (C-05):** el driver `pg` devuelve `bigint` como `string`. Todas las columnas `*_in_cents` usan un `ValueTransformer` (`bigint.transformer.ts`) que convierte a `number` y falla si el valor no es `Number.isSafeInteger`. Sin esto, `a + b` concatena textos.
- **`image_key` (M-03):** la DB guarda solo el *slug* de la imagen (p. ej. `wireless-headphones`); el frontend compone las variantes `/images/products/{key}-{320|640|960}.{avif|webp|jpg}`. Así la DB no conoce formatos ni tamaños.

**Nunca** se persisten PAN, CVC, fecha de expiración ni el token de tarjeta. Solo `card_brand` y `card_last_four` provenientes de la respuesta de la pasarela.

### 4.2 Máquina de estados de `Transaction`

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> APPROVED
  PENDING --> DECLINED
  PENDING --> VOIDED
  PENDING --> ERROR
  APPROVED --> [*]
  DECLINED --> [*]
  VOIDED --> [*]
  ERROR --> [*]
```

- Los estados finales son inmutables: `transaction.finalize(status)` devuelve `err(INVALID_STATE_TRANSITION)` si ya no está en PENDING.
- La transición se persiste con **guardia optimista**: `UPDATE transactions SET ... WHERE id = $1 AND status = 'PENDING'`. Si afecta 0 filas → ya fue finalizada por otro proceso (polling vs webhook) → operación idempotente sin efectos secundarios.

### 4.3 Regla de stock (decisión documentada como ADR-001)

- Al **crear** la transacción: se verifica `stock >= quantity` (falla rápido con 409).
- Al **finalizar APPROVED**, dentro de una única transacción de DB:
  1. `UPDATE transactions ... WHERE status='PENDING'`
  2. `UPDATE products SET stock = stock - $q WHERE id = $p AND stock >= $q` (decremento atómico, nunca negativo)
  3. `INSERT INTO deliveries` con status `ASSIGNED` (o `BACKORDERED` si el paso 2 afectó 0 filas por una carrera; se loguea `warn` para gestión manual).
- DECLINED/VOIDED/ERROR: solo se actualiza la transacción; el stock no cambia.
- **Invariante de consistencia (I-06):** antes de finalizar se comprueba que `reference`, `amount_in_cents` y `currency` reportados por la pasarela coinciden con la transacción. Si no coinciden → la transacción pasa a ERROR con `status_message = 'AMOUNT_MISMATCH'`, no se crea entrega ni se toca el stock y se loguea `error` para revisión manual.
- Por qué no reservar stock al crear: la cuenta sandbox es compartida y no se puede configurar el webhook de forma fiable; una transacción abandonada retendría stock indefinidamente sin un job de expiración. Se deja la reserva como mejora futura en el ADR.
- Toda PENDING termina en un estado final gracias a la reconciliación programada (BE-14, ADR-007), así el descuento de stock no depende de que el cliente siga en la página.

### 4.4 Pricing

`total = price × quantity + BASE_FEE + DELIVERY_FEE` en centavos. Fees vienen de config (`BASE_FEE_IN_CENTS`, `DELIVERY_FEE_IN_CENTS`) a través del puerto `FeePolicy` (Strategy) para poder variar el costo de envío por ciudad sin tocar casos de uso. **El backend siempre recalcula**; el frontend nunca envía montos.

---

## 5. Contrato de API

Prefijo global: `/api`, versionado por URI: `/api/v1/...`. JSON `camelCase`. Errores `application/problem+json` (RFC 9457):

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "code": "INSUFFICIENT_STOCK",
  "detail": "Only 2 units available",
  "instance": "/api/v1/transactions",
  "requestId": "0f8c..."
}
```

`type` es `about:blank` (I-04): RFC 9457 indica que si `type` es una URL `https`, al resolverla SHOULD mostrar documentación del problema, y `https://errors.checkout.local/...` no resuelve a nada; tampoco hay una URL pública estable para documentarlos. Con `about:blank`, `title` es la frase del status HTTP y el cliente distingue el problema por el miembro de extensión `code`. Los códigos y sus ejemplos se documentan en Swagger.

| # | Método | Ruta | Recurso | Descripción |
|---|---|---|---|---|
| 1 | GET | `/api/v1/health` | — | Liveness + ping DB |
| 2 | GET | `/api/v1/products` | stock | Lista productos con stock (`?limit` ≤ 50) |
| 3 | GET | `/api/v1/products/:id` | stock | Detalle (`ParseUUIDPipe`) |
| 4 | GET | `/api/v1/products/:id/stock` | stock | `{ productId, available, updatedAt }` — recurso **stock** explícito, liviano, usado en el paso 5 (I-07) |
| 5 | GET | `/api/v1/checkout/quote?productId&quantity` | pricing | Desglose: producto, base fee, delivery fee, total |
| 6 | GET | `/api/v1/checkout/acceptance` | pasarela | Tokens de aceptación + permalinks de términos (cache 5 min) |
| 7 | POST | `/api/v1/customers` | customers | Upsert por email → 201 (nuevo, con `Location`) / 200 (existente) |
| 8 | GET | `/api/v1/customers/:id` | customers | Datos **enmascarados** (`j***@mail.com`, `***4567`) |
| 9 | POST | `/api/v1/transactions` | transactions | Crea PENDING + cobra. Header **`Idempotency-Key`** obligatorio. 201 nuevo / 200 replay |
| 10 | GET | `/api/v1/transactions/:id` | transactions | Estado; si PENDING sincroniza con la pasarela |
| 11 | GET | `/api/v1/transactions?idempotencyKey=` | transactions | Recuperación tras refresh durante el POST |
| 12 | GET | `/api/v1/deliveries/:id` | deliveries | Detalle de la entrega asignada |
| 13 | POST | `/api/v1/payment-events` | eventos | Webhook de la pasarela (checksum obligatorio) |

**Upsert de customers (M-12, trade-off documentado):** es un checkout de invitado sin autenticación; el último nombre/teléfono enviado para un email gana. El riesgo queda acotado porque ninguna respuesta devuelve datos completos (siempre enmascarados) y la transacción guarda su propio *snapshot* de envío.

### 5.1 `POST /api/v1/customers`

```json
// request
{ "fullName": "Ana Pérez", "email": "ana@mail.com", "phone": "3001234567" }
// 201/200 response
{ "id": "uuid", "fullName": "Ana Pérez", "email": "a***@mail.com", "phone": "***4567" }
```

Validaciones: `fullName` 3–80 chars letras/espacios; `email` RFC + lowercase + trim; `phone` colombiano `^3\d{9}$`.

### 5.2 `POST /api/v1/transactions`

```http
POST /api/v1/transactions
Idempotency-Key: 7b1d3f0e-...-uuidv4
Content-Type: application/json
```

```json
{
  "productId": "uuid",
  "quantity": 1,
  "customerId": "uuid",
  "delivery": {
    "recipientName": "Ana Pérez",
    "recipientPhone": "3001234567",
    "addressLine1": "Cra 43A # 1-50",
    "addressLine2": "Apto 301",
    "city": "Medellín",
    "region": "Antioquia",
    "country": "CO",
    "postalCode": "050021"
  },
  "payment": {
    "cardToken": "tok_...",
    "installments": 1,
    "acceptanceToken": "eyJ...",
    "acceptPersonalAuth": "eyJ..."
  }
}
```

Respuesta `201 Created` + `Location: /api/v1/transactions/{id}`:

```json
{
  "id": "uuid",
  "reference": "TX-01J9ZK3...",
  "status": "PENDING",
  "statusMessage": null,
  "amounts": { "product": 15000000, "baseFee": 300000, "deliveryFee": 1000000, "total": 16300000, "currency": "COP" },
  "product": { "id": "uuid", "name": "...", "quantity": 1 },
  "card": { "brand": "VISA", "lastFour": "4242" },
  "deliveryId": null,
  "createdAt": "2026-10-01T15:00:00Z"
}
```

Validaciones clave (pensando en casos reales):

- `quantity` entero 1–10 y ≤ stock actual.
- `installments` entero 1–36.
- `delivery.country` ∈ `{'CO'}` y moneda `COP` (la pasarela opera en Colombia); `recipientPhone` `^3\d{9}$`; `postalCode` opcional de 6 dígitos.
- `customerId` debe existir; `productId` debe existir.
- Payload máximo 16 KB; propiedades desconocidas → 400.

Idempotencia (C-04, I-05, ADR-006):

- `Idempotency-Key` UUID v4 obligatorio (400 si falta o no es UUID v4).
- `request_hash` = SHA-256 del **fingerprint canónico** del body: `productId`, `quantity`, `customerId`, `delivery` e `installments`, con llaves ordenadas. **Se excluyen las credenciales de un solo uso** (`cardToken`, `acceptanceToken`, `acceptPersonalAuth`): cambian cada vez que el usuario re-ingresa la tarjeta, pero no cambian la intención de compra.
- Misma key + mismo fingerprint → **200 OK** con la transacción existente (en su estado actual), header `Idempotent-Replayed: true` y `Location`. No se llama de nuevo a la pasarela.
- Misma key + fingerprint distinto → **422** `IDEMPOTENCY_CONFLICT`.
- Dos requests concurrentes con la misma key: el `UNIQUE(idempotency_key)` hace fallar el segundo `INSERT`; el caso de uso captura la violación de unicidad, carga la existente y responde como replay. Nunca hay dos cobros.
- Por qué se excluyen los tokens: si el usuario refresca durante el POST, el front no tiene el `cardToken` (no se persiste) y pide re-ingresar la tarjeta. Reenviando con la **misma key**, si el POST original sí llegó se devuelve esa transacción; si no llegó, se crea. Así se cierra la ventana de doble cobro.

Semántica del cobro:

- La pasarela responde 4xx (token inválido/expirado, datos rechazados) → la transacción queda **ERROR** con `statusMessage` y se responde **201** con ese estado (el recurso sí se creó; el pago falló). El frontend muestra el estado final.
- Timeout / 5xx / red → **el resultado es desconocido, no un fallo**: la transacción permanece PENDING sin `gatewayTransactionId`; el sync (BE-08) o la reconciliación (BE-14) la resuelven buscando por `reference` en la pasarela. Nunca se reintenta automáticamente un POST de cobro.
- La fila PENDING se **confirma en la DB antes** de llamar a la pasarela, para que siempre exista algo que reconciliar.

### 5.3 `GET /api/v1/transactions/:id`

Si `status = PENDING` → ejecuta `SyncTransactionStatus` (consulta la pasarela por id o por referencia) y, si hay estado final, `FinalizeTransaction`. Devuelve el mismo shape de 5.2 con `deliveryId` poblado cuando aplica. Rate-limit por IP para evitar abuso del polling.

Sobre la semántica HTTP: el GET sigue siendo **seguro e idempotente** desde el punto de vista del cliente (no pide ningún cambio); la sincronización solo hace converger nuestra copia con el estado real en la pasarela, y repetirla no tiene efectos adicionales.

### 5.4 `POST /api/v1/payment-events`

Recibe `transaction.updated`. Verifica checksum (ver 6.3) con `crypto.timingSafeEqual`; si no coincide → 401. Si es válido → `FinalizeTransaction` por `reference`. Responde 200 siempre que el evento sea válido (incluso si ya estaba finalizada → idempotente). Excluido del throttler.

> Nota: la cuenta sandbox es **compartida entre candidatos** y la prueba prohíbe modificar su configuración, por lo que la URL de eventos no se puede registrar de forma fiable. La confirmación tiene tres mecanismos (ADR-003): (1) **polling del cliente** con sincronización server-side (5.3), (2) **reconciliación programada** cada 5 min que no depende del cliente (BE-14, ADR-007) y (3) el **webhook**, que se implementa, prueba y documenta como complemento.

### 5.5 Reconciliación programada (BE-14, C-03)

Sin ella, si el usuario cierra la pestaña antes del estado final, una transacción aprobada quedaría PENDING para siempre: sin entrega y sin descuento de stock. Una Lambda `reconcile`, invocada por EventBridge Scheduler cada 5 min, ejecuta `ReconcilePendingTransactions`:

1. Busca PENDING con `created_at` anterior a `RECONCILE_MIN_AGE_SECONDS` (60 s), en lotes de `RECONCILE_BATCH_SIZE` (25) usando el índice `(status, created_at)`.
2. Aplica `SyncTransactionStatus` a cada una (mismo camino que el GET, por lo que es idempotente con el polling y el webhook).
3. Si una PENDING **no tiene registro en la pasarela** después de `PENDING_EXPIRATION_MINUTES` (15), pasa a ERROR con `status_message = 'EXPIRED_WITHOUT_GATEWAY_RECORD'` (el cobro nunca llegó a la pasarela, p. ej. la Lambda murió entre el INSERT y el POST).
4. Devuelve un resumen `{ scanned, finalized, expired, failed }` que se loguea como métrica.

---

## 6. Integración con la pasarela

### 6.1 Flujo

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant PG as Payment Gateway
  participant API as Checkout API
  participant DB as PostgreSQL
  FE->>API: GET /checkout/acceptance
  API->>PG: GET /merchants/{publicKey}
  PG-->>API: presigned_acceptance, presigned_personal_data_auth
  FE->>PG: POST /tokens/cards (public key) — PAN nunca toca nuestra API
  PG-->>FE: card token
  FE->>API: POST /customers
  FE->>API: POST /transactions (Idempotency-Key, cardToken)
  API->>DB: INSERT transaction PENDING (reference)
  API->>PG: POST /transactions (private key + signature)
  PG-->>API: id, status PENDING
  API->>DB: UPDATE gateway_transaction_id
  API-->>FE: 201 PENDING
  loop polling cada 2–5 s
    FE->>API: GET /transactions/:id
    API->>PG: GET /transactions/{gatewayId}
    alt estado final
      API->>DB: tx: update status + decrementar stock + crear delivery
    end
    API-->>FE: status
  end
  Note over API,PG: Además, cada 5 min la Lambda reconcile sincroniza las PENDING > 60 s (§5.5)
```

### 6.2 Puerto

```ts
export interface PaymentGatewayPort {
  getAcceptanceTokens(): Promise<Result<AcceptanceTokens, GatewayError>>;
  createCardTransaction(req: CardTransactionRequest): Promise<Result<GatewayTransaction, GatewayError>>;
  getTransaction(gatewayId: string): Promise<Result<GatewayTransaction, GatewayError>>;
  findTransactionByReference(reference: string): Promise<Result<GatewayTransaction | null, GatewayError>>;
}
export type GatewayError =
  | { code: 'GATEWAY_UNAVAILABLE'; cause: 'TIMEOUT' | 'NETWORK' | 'HTTP_5XX' }
  | { code: 'GATEWAY_REJECTED'; reason: string };
```

### 6.3 Adaptador HTTP (`http-payment-gateway.adapter.ts`)

- **URL base (I-09):** la prueba entrega dos URLs UAT; se usa **la de sandbox** (host con prefijo `api-sandbox`), coherente con las llaves `*_stagtest_*` y con la exigencia de operar siempre en sandbox. El valor vive solo en variables/SSM.
- `GET {PG_BASE_URL}/merchants/{PG_PUBLIC_KEY}` → `data.presigned_acceptance.acceptance_token` y `data.presigned_personal_data_auth.acceptance_token` (+ `permalink` de cada uno para mostrar términos).
- `POST {PG_BASE_URL}/transactions` con `Authorization: Bearer {PG_PRIVATE_KEY}` y body:
  `acceptance_token, accept_personal_auth, amount_in_cents, currency, signature, customer_email, reference, payment_method: { type: 'CARD', token, installments }, customer_data: { full_name, phone_number }, shipping_address: { address_line_1, address_line_2, country, region, city, phone_number, postal_code, name }`.
  - Teléfonos (I-19): `shipping_address.phone_number` en formato nacional de 10 dígitos; `customer_data.phone_number` con indicativo (`57` + 10 dígitos). Se confirma con el spike de BE-06 y se fija en `gateway.mapper.ts`.
- `GET {PG_BASE_URL}/transactions/{id}` (no requiere llave; se envía igual la privada por uniformidad) y `GET {PG_BASE_URL}/transactions?reference={ref}` (requiere llave privada; devuelve una lista).
- **Firma de integridad** (solo server-side): `sha256(reference + amountInCents + currency + PG_INTEGRITY_SECRET)` en hex.
- **Checksum de eventos**: concatenar los valores de `data` indicados en `signature.properties` (en orden, p. ej. `transaction.id`, `transaction.status`, `transaction.amount_in_cents`) + `timestamp` + `PG_EVENTS_SECRET` → `sha256` → comparar con `signature.checksum` (o header `X-Event-Checksum`) en tiempo constante.
- **Presupuesto de tiempo (I-02):** la Lambda tiene 20 s y API Gateway corta a 30 s, así que 8 s × 3 intentos + backoff no cabe. Se usa:
  - `POST /transactions`: timeout 8 s, **sin reintentos**.
  - GET: timeout 4 s por intento, máx. 2 reintentos con backoff exponencial + jitter, y un **deadline total de 12 s** que corta los reintentos restantes.
- Respuestas externas validadas con `zod` antes de mapear a dominio (`unknown` → tipo).
- Mapeo de estados PG → dominio: `APPROVED|DECLINED|VOIDED|ERROR|PENDING` (valor desconocido → se mantiene PENDING y se loguea `warn`).
- **Spike de verificación (BE-06):** antes de fijar los schemas zod, se ejecuta un script manual (`scripts/pg-smoke.ts`, fuera del bundle y de CI) contra la sandbox desde la máquina de desarrollo: merchants, tokenización de `4242…`, creación, consulta por id y por referencia. Las respuestas reales (sin llaves) se guardan como *fixtures* de tests.

Variables de entorno (sin el nombre de la compañía):

```
PG_BASE_URL=                     # URL UAT de *sandbox* (host con prefijo api-sandbox); en AWS desde SSM
PG_PUBLIC_KEY=
PG_PRIVATE_KEY=
PG_INTEGRITY_SECRET=
PG_EVENTS_SECRET=
PG_POST_TIMEOUT_MS=8000
PG_GET_TIMEOUT_MS=4000
PG_GET_MAX_RETRIES=2
PG_DEADLINE_MS=12000
ACCEPTANCE_CACHE_TTL_SECONDS=300
BASE_FEE_IN_CENTS=300000
DELIVERY_FEE_IN_CENTS=1000000
CURRENCY=COP
RECONCILE_MIN_AGE_SECONDS=60
RECONCILE_BATCH_SIZE=25
PENDING_EXPIRATION_MINUTES=15
DATABASE_URL= | DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (Secrets Manager en AWS)
DB_SSL_CA_PATH=                  # certs/global-bundle.pem en AWS; vacío en local
DB_POOL_MAX=2
CORS_ALLOWED_ORIGINS=
APP_ENV=local                    # local | aws — con aws, el schema zod exige ORIGIN_VERIFY_SECRET (fail-fast)
ORIGIN_VERIFY_SECRET=            # solo en AWS (Secrets Manager, generado por CDK — C-06)
```

Datos de prueba sandbox (documentar en README): `4242 4242 4242 4242` → APPROVED, `4111 1111 1111 1111` → DECLINED; expiración futura y CVC de 3 dígitos.

---

## 7. Features incrementales

Cada feature = **una rama `feat/be-XX-...` creada desde `main` + un PR hacia `main`** con commits convencionales pequeños. DoD común a todas: lint + typecheck en verde, tests nuevos, cobertura global ≥ 85 %, `dependency-cruiser` sin violaciones, Swagger actualizado si cambia el contrato.

### BE-00 · Scaffolding y tooling

**Objetivo:** esqueleto ejecutable con calidad automatizada desde el primer commit.

- Nest CLI en `apps/api`, TS strict, path aliases (`@shared/*`, `@modules/*`).
- ESLint (typescript-eslint `strict-type-checked`), Prettier, Husky + lint-staged + commitlint (conventional).
- `jest.config.ts` con **projects** `unit`, `integration` y `e2e`, y `coverageThreshold.global = { branches: 85, functions: 85, lines: 85, statements: 85 }`; excluir solo `main.ts`, `*.module.ts`, `migrations/`, `seeds/` y `scripts/` (los handlers Lambda sí se testean en BE-12/BE-14). Scripts: `test` (todo, con cobertura; lo usa CI), `test:unit` (sin Docker, feedback rápido), `test:int`, `test:e2e`.
- `env.schema.ts` (zod) + `AppConfigService` tipado; fail-fast si falta una variable.
- `GET /api/v1/health`.
- `docker-compose.yml` con Postgres 16 para desarrollo local; `.env.example` con placeholders; `.nvmrc` con Node 24.
- `.dependency-cruiser.cjs` con las reglas de 2.1.

**Aceptación:** `npm run lint && npm test && npm run build` pasan; `GET /api/v1/health` → `200 {"status":"ok"}`; arrancar sin `PG_PRIVATE_KEY` falla con mensaje claro.

### BE-01 · Shared kernel: ROP, errores y HTTP transversal

- `Result`, `AsyncResult` (map, andThen, mapErr, tap, match, `combine`), 100 % cubiertos.
- `Money` VO (entero, no negativo, misma moneda para sumar), `DomainError`, puertos `Clock` e `IdGenerator`.
- `ProblemDetailsFilter` global + `domain-error.http-mapper.ts` + helper `respond(result, res, successStatus)`.
- Middleware `x-request-id` (genera si no viene) propagado a logs y problem+json.
- `nestjs-pino` con `redact: ['req.headers.authorization', '*.cardToken', '*.email', '*.phone', '*.acceptanceToken', '*.acceptPersonalAuth']`.
- `ValidationPipe` global: `whitelist`, `forbidNonWhitelisted`, `transform`, errores → `VALIDATION_ERROR` con lista de campos.

**Aceptación:** una excepción no controlada devuelve 500 problem+json sin stack; un body con campo extra → 400 con detalle del campo.

### BE-02 · Persistencia, migraciones y seed

- `data-source.ts` (TypeORM) compartido por app y CLI de migraciones; entidades y migraciones como **arrays de clases importadas** (I-15); pool pequeño (`DB_POOL_MAX=2`) pensado para Lambda; TLS con `ssl: { rejectUnauthorized: true, ca }` cuando `DB_SSL_CA_PATH` está definido.
- `bigint.transformer.ts` aplicado a todas las columnas `*_in_cents` (C-05), con test unitario (string → number, rechazo de valores no seguros).
- Migración inicial con las 4 tablas, enums, checks, índices y extensión `citext`; columna `image_key` (M-03). Las migraciones siguientes son **expand/contract** (retrocompatibles), porque el código nuevo se publica antes de migrar (I-16).
- Seed **idempotente** (upsert por `sku`) de 4–6 productos dummy con `image_key`, precios en centavos COP y stock variado (incluir uno con stock 0 para probar el estado agotado). Precios moderados para no chocar con límites de monto de la sandbox.
- Puerto `UnitOfWork` (`runInTransaction<T>(work: (repos) => Promise<Result<T,E>>)`) + adaptador con `QueryRunner`: si el `Result` es `Err` → rollback.
- Scripts: `migration:generate`, `migration:run`, `seed`.

**Aceptación:** `migration:run` + `seed` dos veces seguidas no duplican datos; tests de integración (Testcontainers) cubren el rollback del UoW; los montos leídos de la DB son `number`.

### BE-03 · Products (stock)

- Dominio `Product` (VO `Money`, `hasStock(q)`), puerto `ProductRepository`.
- Casos de uso `ListProducts`, `GetProduct`, `GetProductStock` (ROP).
- Controller + DTOs de respuesta + decoradores Swagger. `ParseUUIDPipe` → 400 si id inválido.
- `GET /api/v1/products/:id/stock` → `{ productId, available, updatedAt }` (I-07).
- Header `Cache-Control: no-store` (el stock cambia).

**Aceptación:** `GET /products` lista seed; `GET /products/{uuid-inexistente}` → 404 problem+json; `GET /products/abc` → 400; `GET /products/{id}/stock` devuelve el stock actual.

### BE-04 · Checkout: pricing y quote

- Puerto `FeePolicy` + `FlatFeePolicy` (config). Función pura `priceOrder(product, quantity, feePolicy)` → `OrderAmounts`.
- `GetQuote` + `GET /api/v1/checkout/quote?productId&quantity` (valida quantity 1–10 y stock).

**Aceptación:** tests de tabla para `priceOrder` (1 y N unidades, total = suma exacta); quantity > stock → 409.

### BE-05 · Customers

- Dominio `Customer` (email normalizado), puerto `CustomerRepository` con `upsertByEmail`.
- `RegisterCustomer` (201 nuevo / 200 existente, actualiza nombre/teléfono), `GetCustomer` (respuesta enmascarada).

**Aceptación:** dos POST con el mismo email en distinto casing → un solo registro; GET nunca devuelve email/teléfono completos.

### BE-06 · Adaptador de la pasarela + acceptance

- `PaymentGatewayPort`, `HttpPaymentGatewayAdapter`, `integrity-signature.ts`, `event-checksum.ts`, schemas zod de respuestas.
- `GetAcceptance` + `GET /api/v1/checkout/acceptance` con caché en memoria (TTL 5 min) implementada como **decorador** del puerto (`CachedAcceptanceProvider`).
- Timeouts, reintentos solo GET y deadline total según §6.3 (I-02).
- **Spike** `scripts/pg-smoke.ts` contra la sandbox (§6.3) → *fixtures* reales para los tests y confirmación del formato de teléfonos (I-19).
- `FakePaymentGateway` en `test/fakes` configurable (APPROVED/DECLINED/timeout/rejected/amount-mismatch).

**Aceptación:** tests unitarios con `fetch` mockeado: mapeo de éxito, 4xx → `GATEWAY_REJECTED` (→ 502 en `/checkout/acceptance`), abort → `GATEWAY_UNAVAILABLE/TIMEOUT` (→ 503 + `Retry-After`), respuesta malformada → `GATEWAY_UNAVAILABLE`; el POST no se reintenta; los reintentos GET se detienen al vencer el deadline (fake timers); firma verificada contra un vector conocido; checksum válido/inválido.

### BE-07 · Crear transacción (PENDING + cobro)

- Entidad `Transaction` con fábrica `Transaction.createPending(...)` e invariantes (quantity > 0, total coherente).
- `ReferenceGenerator` (`TX-<ULID>`), `request_hash` sobre el **fingerprint canónico sin credenciales de un solo uso** (C-04).
- `CreateTransaction` según el pipeline de 2.2; idempotencia (5.2); semántica de errores de la pasarela (5.2).
- `POST /api/v1/transactions` con `@Headers('idempotency-key')` validado, `Location`, `Idempotent-Replayed`; 201 al crear, 200 en replay (I-05).
- `GET /api/v1/transactions?idempotencyKey=` (`FindTransactionByIdempotencyKey`).
- Throttle específico: 10 req/min/IP.

**Aceptación (Given/When/Then):**
- Dado stock 5, cuando se crea con quantity 2 y token válido → 201 PENDING, `reference` única, `gatewayTransactionId` guardado, stock **aún** 5.
- Dado el mismo `Idempotency-Key` y body → 200 con la misma transacción y `Idempotent-Replayed: true`, sin segunda llamada a la pasarela (verificado con spy del fake).
- Dado el mismo `Idempotency-Key`, mismo pedido y **otro `cardToken`** → replay (200), sin segundo cobro.
- Dado el mismo `Idempotency-Key` con otra `quantity` → 422 `IDEMPOTENCY_CONFLICT`.
- Dadas dos requests concurrentes con la misma key → una sola fila y un solo cobro.
- Dado un token rechazado → 201 con status ERROR y `statusMessage`.
- Dado timeout de la pasarela → 201 PENDING sin `gatewayTransactionId`.
- Dado quantity > stock → 409 y no se llama a la pasarela.

### BE-08 · Sincronización y finalización

- `SyncTransactionStatus`: si PENDING con `gatewayTransactionId` → `getTransaction`; sin él → `findTransactionByReference`; estado final → `FinalizeTransaction`.
- `FinalizeTransaction` en `UnitOfWork`: invariante de consistencia (I-06), guardia optimista, decremento atómico, creación de `Delivery` (ASSIGNED/BACKORDERED) con snapshot de envío, `finalized_at`, `card_brand/last_four`.
- `GET /api/v1/transactions/:id` usa Sync.

**Aceptación:**
- APPROVED → stock decrementado exactamente `quantity`, 1 delivery ASSIGNED, `deliveryId` en respuesta.
- DECLINED → stock intacto, sin delivery.
- Dos finalizaciones concurrentes (test de integración con `Promise.all`) → un solo decremento y una sola delivery.
- Estado final nunca cambia en llamadas posteriores.
- Monto o moneda de la pasarela distintos a los de la transacción → ERROR `AMOUNT_MISMATCH`, sin delivery ni cambio de stock.

### BE-09 · Deliveries

- Dominio `Delivery`, `GetDelivery`, `GET /api/v1/deliveries/:id` (datos de dirección + estado, teléfono enmascarado).

**Aceptación:** 404 si no existe; shape documentado en Swagger.

### BE-10 · Webhook de eventos

- `HandlePaymentEvent`: valida checksum → busca por `reference` → `FinalizeTransaction` (con la misma invariante I-06).
- `POST /api/v1/payment-events`, excluido del throttler, body limit 32 KB, ignora eventos distintos de `transaction.updated` (200 no-op).

**Aceptación:** checksum inválido → 401 y ningún cambio; evento duplicado → 200 idempotente.

### BE-11 · Hardening de seguridad (OWASP)

- `helmet` (API: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, HSTS), relajado solo para `/api/docs`.
- CORS allowlist desde config (en AWS el front y la API comparten origen vía CloudFront, CORS queda cerrado).
- `@nestjs/throttler` global (60 req/min/IP) + límites por ruta. **Tracker de IP (I-01):** detrás de CloudFront → API Gateway, `req.ip` es la IP del edge; `client-ip.tracker.ts` usa el header `CloudFront-Viewer-Address` (lo agrega CloudFront y el cliente no puede falsificarlo) y cae a `req.ip` en local. Los contadores viven en memoria de cada instancia Lambda, así que el límite es *best-effort*; la protección global la da el throttling de API Gateway y, como mejora opcional con costo, una regla rate-based de AWS WAF.
- `OriginVerifyGuard`: con `APP_ENV=aws`, 403 si el header `X-Origin-Verify` falta o no coincide (comparación en tiempo constante).
- Checklist OWASP API Top 10 en `docs/security/README.md` (ver sección 9; M-02).
- `npm audit --omit=dev` sin vulnerabilidades altas en CI.

**Aceptación:** tests e2e verifican headers de seguridad presentes, 429 al superar el límite (también variando `CloudFront-Viewer-Address`) y 403 sin `X-Origin-Verify` cuando `APP_ENV=aws`.

### BE-12 · Handler Lambda

- `lambda.ts` con `@codegenie/serverless-express`; la app Nest se crea una vez por contenedor (cache en variable de módulo) para reducir cold starts.
- Carga de secretos desde SSM/Secrets Manager al inicializar (antes de construir la app) con caché: llaves de la pasarela, credenciales de DB y `ORIGIN_VERIFY_SECRET`.
- Handler separado `migrate.ts` que ejecuta migraciones + seed (invocado desde CD, ya que RDS es privada) y `reconcile.ts` (BE-14), ambos con `NestFactory.createApplicationContext` (sin HTTP).
- **Build en dos pasos (C-01, ADR-005):**
  1. `nest build` → `dist/` con tsc (emite `design:paramtypes`) y el plugin CLI de `@nestjs/swagger`.
  2. `scripts/bundle-lambda.mjs` → esbuild sobre `dist/lambda.js`, `dist/migrate.js` y `dist/reconcile.js` (`platform: node`, `target: node24`, `format: cjs`, `minify`, `sourcemap`, `keepNames: true` para que Nest resuelva nombres de clases).
  3. **Externals:** módulos opcionales de Nest no usados (`@nestjs/microservices`, `@nestjs/websockets`, `@fastify/*`, `class-transformer/storage`), drivers de TypeORM no usados (`mysql`, `mysql2`, `sqlite3`, `better-sqlite3`, `oracledb`, `mssql`, `sql.js`, `mongodb`, `redis`, `ioredis`, `hdb-pool`, `@sap/hana-client`, `typeorm-aurora-data-api-driver`, `react-native-sqlite-storage`, `pg-native`, `pg-query-stream`) y `swagger-ui-dist` (I-14).
  4. Copia a `dist-lambda/`: `node_modules/swagger-ui-dist` (Swagger UI lee sus assets del disco) y `certs/global-bundle.pem`.
- Handlers solo async (Node 24 no admite handlers con callback, I-08).

**Aceptación:** test unitario del handler con evento API Gateway v2 simulado → 200 en `/api/v1/health`; el bundle arranca con `node -e "require('./dist-lambda/lambda.js')"` sin errores de DI; `/api/docs` sirve sus assets desde el bundle.

### BE-13 · Documentación y reporte

- Swagger en `/api/docs` (DTOs con `@ApiProperty`, ejemplos, respuestas de error).
- Exportar `docs/postman/checkout-api.postman_collection.json` con variables `{{baseUrl}}` y ejemplos de cada flujo (aprobada, rechazada, idempotencia).
- Sección README backend: arquitectura, ER, endpoints, cómo correr, tabla de cobertura (`jest --coverage` `text-summary`).

### BE-14 · Reconciliación programada (C-03, ADR-007)

> Se implementa en la fase 7, junto con BE-10.

- Caso de uso `ReconcilePendingTransactions` (§5.5) que reutiliza `SyncTransactionStatus`; puerto `TransactionRepository.findPendingOlderThan(date, limit)`.
- Regla de expiración: PENDING sin registro en la pasarela y más antigua que `PENDING_EXPIRATION_MINUTES` → ERROR `EXPIRED_WITHOUT_GATEWAY_RECORD`.
- Handler `reconcile.ts` (sin HTTP) que registra el resumen `{ scanned, finalized, expired, failed }`; un fallo en una transacción no detiene el lote.

**Aceptación:**
- PENDING de hace 2 min, APPROVED en la pasarela → APPROVED, stock decrementado, delivery creada, sin intervención del cliente.
- PENDING de hace 20 min sin registro en la pasarela → ERROR `EXPIRED_WITHOUT_GATEWAY_RECORD`.
- PENDING de hace 30 s → no se toca.
- Reconciliación y polling simultáneos → un solo decremento (misma guardia optimista).

---

## 8. Estrategia de pruebas

| Nivel | Qué | Herramientas | Dobles |
|---|---|---|---|
| Unit — dominio | `Money`, `Transaction` state machine, `priceOrder`, firma, checksum, `Result` | Jest | ninguno |
| Unit — aplicación | cada caso de uso, rutas felices y cada rama de error | Jest | fakes in-memory de puertos, `FixedClock` |
| Unit — adaptadores | mapper PG, adaptador HTTP con `fetch` mockeado | Jest | `jest.spyOn(global, 'fetch')` |
| Integración | repos TypeORM, UoW, concurrencia de finalización | Jest + Testcontainers | Postgres real |
| E2E | endpoints vía `supertest` sobre la app completa | Jest + supertest | `FakePaymentGateway` sustituyendo el token del puerto |

Reglas: patrón AAA, un comportamiento por test, builders (`aProduct().withStock(3).build()`), nombres `should <resultado> when <condición>`. Cobertura objetivo ≥ 90 %, umbral de CI 85 % (margen sobre el 80 % exigido).

Cobertura (M-04): el gate de CI mide la corrida **combinada** (unit + integration + e2e; el runner de GitHub tiene Docker para Testcontainers). `npm run test:unit` corre sin Docker para feedback rápido. El README reporta ambas cifras; los adaptadores de persistencia se mantienen delgados para que la corrida unitaria también supere el 80 %.

---

## 9. Seguridad — mapeo OWASP API Top 10 (2023)

| Riesgo | Mitigación |
|---|---|
| API1 BOLA | IDs UUID v4 no enumerables; respuestas de customer/delivery enmascaradas |
| API2 Broken auth | Webhook con checksum SHA-256 en tiempo constante; llaves privadas solo server-side |
| API3 Property level | DTOs con whitelist; nunca se exponen entidades ORM; montos calculados en servidor |
| API4 Resource consumption | Throttling de API Gateway, throttler por IP (best-effort), límite de payload, `limit` máx. en listados, pool de DB acotado, concurrencia de Lambda configurable |
| API5 Function level auth | No hay endpoints administrativos expuestos (no crear productos) |
| API6 Sensitive business flows | Idempotency-Key obligatoria contra doble cobro; límite por IP en POST transactions |
| API7 SSRF | URL de la pasarela fija por config, sin URLs de entrada del usuario |
| API8 Misconfiguration | helmet, CORS allowlist, errores sin stack, HTTPS only (CloudFront) |
| API9 Inventory | Versionado `/v1`, Swagger publicado |
| API10 Unsafe consumption | Validación zod de respuestas externas, timeouts, sin reintentos de POST |

Además: nada de PAN/CVC en DB ni logs (el token se crea en el cliente directamente contra la pasarela), secretos en SSM/Secrets Manager, queries parametrizadas vía ORM.

---

## 10. Convenciones de trabajo

- Ramas desde `main`: `feat/be-07-create-transaction`, `fix/...`, `chore/...`; PR por feature hacia `main` con plantilla (Qué / Por qué / Cómo probar / Checklist DoD); merge solo con CI en verde.
- Commits: Conventional Commits, pequeños y frecuentes (la prueba penaliza repos sin progreso visible).
- ADRs en `docs/adr/` (001-stock-decrement-on-approval, 002-client-side-tokenization, 003-payment-confirmation-strategy, 004-lambda-postgres, 005-lambda-build-tsc-esbuild, 006-idempotency-fingerprint, 007-scheduled-reconciliation).
