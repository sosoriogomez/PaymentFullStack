# Spec Frontend — Checkout SPA

> **Versión 1.2** — incorpora las correcciones de la revisión y el ajuste de alcance S-02 (ver [`CHANGELOG.md`](./CHANGELOG.md); los IDs `C-xx`/`I-xx`/`M-xx` remiten a ese registro).

> **Regla de nombres:** el repositorio es público y **no puede contener el nombre de la compañía evaluadora**. En código y textos se usa **Payment Gateway (PG)** / "pasarela". La URL y la llave pública de la pasarela se inyectan por variables de entorno de build.

---

## 0. Contexto y alcance

SPA **mobile-first** que implementa el flujo de 5 pantallas:

```
1. Product page → 2. Credit Card / Delivery info (modal) → 3. Summary (backdrop) → 4. Final status → 5. Product page (stock actualizado)
```

Requisitos de la prueba que este spec cubre explícitamente:

- React + **Redux obligatorio** siguiendo Flux; datos de la transacción en el estado y/o `localStorage`.
- Mobile oriented, responsive, referencia mínima iPhone SE 2020 (1334×750 px físicos = **375×667 px CSS**), nada se sale de los límites de la UI.
- Botón **"Pagar con tarjeta de crédito"** que abre un modal con datos de tarjeta (validados, detección de VISA/Mastercard con logos) + datos de entrega.
- Resumen con monto del producto + **base fee** + **delivery fee** y botón de pago en un **componente Backdrop** (Material).
- Resiliencia: **recuperar el progreso tras un refresh**.
- Imágenes que cargan rápido; flexbox / grid; tests con **Jest > 80 %**.

---

## 1. Stack y librerías

| Tema | Elección | Motivo |
|---|---|---|
| Framework | **React 19** + TypeScript strict | Permitido por la prueba |
| Build | **Vite 7** | Build rápido, code-splitting nativo |
| Estado (Flux) | **Redux Toolkit 2** (`createSlice`, `createAsyncThunk`, `createListenerMiddleware`) | Redux obligatorio; RTK es el estándar oficial |
| Routing | React Router 7 (modo librería, `createBrowserRouter`) | `/` y `/transactions/:id` |
| Formularios | `react-hook-form` + `zod` + `@hookform/resolvers` | Estado de formulario local, validación declarativa |
| Estilos | **CSS Modules + custom properties** (design tokens), flexbox/grid, sin framework CSS | Bonus "CSS skills"; bundle mínimo |
| PostCSS | `autoprefixer` + `browserslist` | Compatibilidad cross-browser |
| Íconos de marca | `simple-icons` (CC0): exporta **datos** (`siVisa.path`, `siVisa.hex`, `siMastercard…`), no componentes; `CardBrandLogo` arma el `<svg>` con ellos (I-11) | Logos VISA/Mastercard sin assets externos |
| Tests | **Jest 30** + `@swc/jest` (o `ts-jest`), `jest-environment-jsdom`, React Testing Library 16, `@testing-library/user-event`, `@testing-library/jest-dom`; polyfill `TextEncoder/TextDecoder` para React Router 7 en jsdom (I-13) | Requisito Jest |
| Calidad | ESLint (typescript-eslint, `react-hooks`, `jsx-a11y`), Prettier, Stylelint, Husky + lint-staged | Clean code y accesibilidad verificables |
| Performance | Lighthouse (manual, perfil móvil) | Evidencia de "imágenes que cargan rápido" |

---

## 2. Arquitectura

### 2.1 Flux con Redux Toolkit

```
View (componentes) ──dispatch(action)──▶ Store (reducers puros) ──▶ View (selectors)
          ▲                                     │
          └──── thunks / listener middleware ◀──┘  (efectos: API, pasarela, storage, polling)
```

- **Reducers puros**, sin efectos. Todos los efectos viven en thunks o en el listener middleware.
- **Dependencias inyectadas** vía `thunk.extraArgument` → `{ api, cardTokenizer, storage, idGenerator, clock }`. En tests se inyectan fakes (Ports & Adapters también en el front).
- Componentes: **contenedores** (conectan store, `useAppSelector`/`useAppDispatch`) vs **presentacionales** (props puras, fáciles de testear).
- Selectores memoizados con `createSelector` (p. ej. `selectOrderSummary`, `selectCanPay`).

### 2.2 Estado global

```ts
interface RootState {
  catalog: {
    items: Product[];
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
  };
  checkout: {
    step: 'PRODUCT' | 'PAYMENT_FORM' | 'SUMMARY' | 'PROCESSING' | 'RESULT';
    productId: string | null;
    quantity: number;
    customer: CustomerDraft;          // nombre, email, teléfono
    delivery: DeliveryDraft;          // dirección
    customerId: string | null;
    card: { brand: CardBrand; lastFour: string; holderName: string } | null; // SOLO metadatos
    cardToken: string | null;         // en memoria, NUNCA persistido
    cardTokenExpiresAt: number | null; // epoch ms; si venció al pagar → re-captura (I-18)
    installments: number;
    acceptance: AcceptanceState;      // tokens + links de términos + aceptado (no persistido)
    quote: OrderAmounts | null;
    idempotencyKey: string | null;    // una por intento de compra; sobrevive a la re-captura de tarjeta (C-04)
    cardReentryRequired: boolean;
  };
  transaction: {
    id: string | null;
    reference: string | null;
    status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | null;
    statusMessage: string | null;
    amounts: OrderAmounts | null;
    deliveryId: string | null;
    polling: 'idle' | 'active' | 'timeout';
  };
}
```

### 2.3 Manejo seguro de datos sensibles (decisión ADR-002)

- **Tokenización en el cliente:** el número de tarjeta, CVC y expiración se envían **solo** a `POST {PG_URL}/tokens/cards` con la llave **pública**. Nuestro backend jamás recibe el PAN (menor superficie PCI).
- PAN/CVC viven únicamente en el estado local del formulario (`react-hook-form`) y se descartan tras tokenizar. Nunca van a Redux, logs ni storage.
- En Redux: solo `brand`, `lastFour`, `holderName` y el `cardToken` (este último en memoria, excluido de la persistencia).
- `localStorage` guarda solo lo necesario para recuperar el progreso (ver 2.4), con versión y **TTL de 30 min**, y se limpia al volver a la tienda. Cifrar en el cliente con una llave que vive en el mismo JS no añade seguridad real; la defensa efectiva es no guardar datos sensibles + **CSP estricta** contra XSS (ver spec cloud).
- Trade-off documentado: los borradores de cliente/entrega (nombre, email, teléfono, dirección) sí se persisten para cumplir la recuperación tras refresh; se minimiza su exposición con el TTL de 30 min y el borrado al finalizar o volver a la tienda.
- Sin `dangerouslySetInnerHTML`; Redux DevTools deshabilitado en producción; source maps no publicados.

### 2.4 Persistencia y recuperación tras refresh

Listener middleware que, ante acciones de `checkout/*` o `transaction/*`, escribe (debounce 300 ms) en la llave `checkout-app:v1`:

```json
{ "version": 1, "savedAt": 1790000000000, "data": { "checkout": { ...sin cardToken ni acceptance }, "transaction": { ... } } }
```

Al arrancar: `loadPersistedState(storage, clock)` → valida con zod + TTL + versión (si algo falla, descarta y arranca limpio) → `preloadedState` → dispatch `checkoutRecovered()` que normaliza el paso:

| Paso al refrescar | Qué se recupera | Comportamiento |
|---|---|---|
| PRODUCT | nada relevante | Normal |
| PAYMENT_FORM | producto, cantidad, borradores de cliente/entrega, `idempotencyKey` si existía | Reabre el modal con entrega precargada; tarjeta vacía; términos se aceptan de nuevo (los tokens de aceptación no se persisten) |
| SUMMARY | + `customerId`, metadatos de tarjeta, `idempotencyKey` | Sin `cardToken` → vuelve a PAYMENT_FORM con `cardReentryRequired` y aviso "Por tu seguridad, vuelve a ingresar los datos de tu tarjeta"; **conserva** la `idempotencyKey` |
| PROCESSING con `transaction.id` | id de transacción | Reanuda polling |
| PROCESSING sin `transaction.id` (refresh durante el POST) | `idempotencyKey` | `GET /transactions?idempotencyKey=` (hasta 3 intentos con backoff, por si el POST sigue en vuelo) → si existe, reanuda polling; si no, vuelve a **PAYMENT_FORM** con `cardReentryRequired` y la **misma** `idempotencyKey` (C-04): si el POST original sí llegó, el backend devuelve esa transacción en vez de cobrar de nuevo |
| RESULT | transacción final | Muestra el estado final |
| Deep link `/transactions/:id` sin estado persistido (otra pestaña, storage vacío) | nada | Carga la transacción por id desde la API y muestra su estado; si es PENDING, hace polling (I-10) |

Reglas de la `idempotencyKey` (ADR-006): se genera al llegar a SUMMARY **solo si no existe**; se conserva en refresh y en re-captura de tarjeta; se regenera únicamente con `retryWithAnotherCard()` (tras un estado final fallido, porque esa transacción ya terminó) y se borra con `checkoutReset()`. Si "Editar" cambia la entrega o la cantidad y la key ya fue usada, el backend responde 422 y el front recupera la transacción por key.

El adaptador `Storage` envuelve `localStorage` con `try/catch` (modo privado de Safari / cuota llena) y degrada a memoria.

### 2.5 Estructura de carpetas

```
apps/web/
├── public/images/products/          # imágenes pre-optimizadas (avif/webp/jpg × 320/640/960)
├── scripts/optimize-images.mjs      # sharp: genera variantes y dimensiones
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── store.ts                 # configureStore + extraArgument + listeners
│   │   ├── hooks.ts                 # useAppDispatch / useAppSelector tipados
│   │   ├── router.tsx
│   │   ├── App.tsx
│   │   └── persistence/             # persisted-state.schema.ts, load/save, persistence.listener.ts
│   ├── features/
│   │   ├── catalog/
│   │   │   ├── catalog.slice.ts / catalog.thunks.ts / catalog.selectors.ts
│   │   │   ├── components/          # ProductCard, ProductImage, QuantitySelector, StockBadge
│   │   │   └── pages/ProductPage.tsx
│   │   ├── checkout/
│   │   │   ├── checkout.slice.ts / checkout.thunks.ts / checkout.selectors.ts
│   │   │   ├── domain/              # card-number.ts (luhn, brand, format), expiry.ts, cvc.ts, schemas.ts
│   │   │   └── components/          # PaymentModal, CardForm, CardBrandLogo, DeliveryForm, TermsAcceptance, SummaryBackdrop
│   │   └── transaction/
│   │       ├── transaction.slice.ts / transaction.thunks.ts / polling.listener.ts
│   │       └── pages/TransactionStatusPage.tsx
│   ├── shared/
│   │   ├── api/                     # http-client.ts (Result + problem+json), checkout-api.ts, card-tokenizer.ts
│   │   ├── lib/                     # result.ts, money.ts (Intl es-CO COP), storage.ts, id-generator.ts, clock.ts
│   │   ├── config/env.ts            # único punto que lee import.meta.env
│   │   ├── i18n/es.ts               # textos de UI centralizados (M-01)
│   │   └── ui/                      # Button, TextField, Select, Modal, Backdrop, Spinner, Alert, Skeleton
│   └── styles/                      # tokens.css, reset.css, global.css
├── test/                            # renderWithStore, fakes (api, tokenizer, storage), mocks (env, styles, files), setup/polyfills.ts
└── jest.config.ts
```

### 2.6 Clean code — reglas concretas

- Lógica de negocio del front (Luhn, marca, expiración, formato de moneda) en **funciones puras** en `domain/` y `lib/`, 100 % testeadas; los componentes solo orquestan.
- Componentes ≤ ~120 líneas; si crecen se dividen. Un componente = una responsabilidad.
- Montos en centavos (enteros) en todo el front; se formatean solo al renderizar con `formatCOP(cents)` (`Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`).
- El front **nunca calcula el total que se cobra**: lo muestra desde `GET /checkout/quote`; el backend recalcula.
- Sin strings mágicos para pasos/estados: `as const` + tipos unión.
- Textos de UI en español centralizados en `shared/i18n/es.ts`.

---

## 3. Diseño UX / UI

- **Paso 1 – Producto:** grid de tarjetas (1 columna < 600 px, 2 en tablet, 3 en desktop). Cada tarjeta: imagen, nombre, descripción (clamp 3 líneas), precio, badge de stock ("5 disponibles" / "Agotado"), selector de cantidad (1…min(stock,10)), botón **"Pagar con tarjeta de crédito"** (deshabilitado si stock 0).
- **Paso 2 – Modal:** en móvil es un **bottom sheet** a pantalla completa (`100dvh`, respetando `env(safe-area-inset-*)`), en desktop un diálogo centrado de 480 px. Dos secciones: *Tarjeta* (número con logo de marca en vivo, titular, MM/AA, CVC, cuotas) y *Entrega* (nombre, email, teléfono, dirección, depto., ciudad, código postal) + checkbox de aceptación de términos y de tratamiento de datos con links a los `permalink` de la pasarela. CTA "Continuar".
- **Paso 3 – Summary en Backdrop:** siguiendo el patrón Backdrop de Material: *back layer* con el contexto del producto y *front layer* que se desliza desde abajo con el desglose (producto × cantidad, tarifa base, envío, **total**), tarjeta `VISA •••• 4242`, dirección resumida, botón **"Pagar $163.000"**. El botón se deshabilita al primer click (anti doble cobro) y muestra spinner.
- **Paso 4 – Estado final:** ícono + título por estado (Aprobada / Rechazada / Error / "Estamos confirmando tu pago"), número de transacción (`reference`), montos, datos de entrega si APPROVED. Acciones: "Volver a la tienda" y, si falló, "Intentar con otra tarjeta" (vuelve a PAYMENT_FORM con entrega precargada y **nueva** idempotency key). Redirección automática a la tienda tras 10 s con contador visible y opción "Quedarme aquí" (WCAG 2.2.1).
- **Paso 5 – Producto:** se limpia el checkout, se re-consulta `GET /products` y se muestra el stock actualizado.

Accesibilidad: `role="dialog"`, `aria-modal`, foco atrapado y devuelto al trigger, `Esc` cierra (excepto en PROCESSING), labels visibles, `aria-invalid` + `aria-describedby` en errores, contraste AA, `:focus-visible`, objetivos táctiles ≥ 44 px, `prefers-reduced-motion`.

Inputs de tarjeta: `inputMode="numeric"`, `autoComplete="cc-number" | "cc-name" | "cc-exp" | "cc-csc"`, formato con espacios cada 4 dígitos, sin romper el cursor al editar en medio.

---

## 4. Contrato con el backend (consumido)

Ver `spec-backend.md §5`. Llamadas del front:

| Momento | Llamada |
|---|---|
| Paso 1 / 5 | `GET /api/v1/products` (en el paso 5, además, `GET /api/v1/products/:id/stock` del producto comprado para mostrar el stock actualizado de inmediato) |
| Abrir modal | `GET /api/v1/checkout/acceptance` |
| "Continuar" en modal | `POST {PG_URL}/tokens/cards` (pública) → `POST /api/v1/customers` → `GET /api/v1/checkout/quote` |
| "Pagar" | `POST /api/v1/transactions` con `Idempotency-Key` |
| Paso 4 | polling `GET /api/v1/transactions/:id` → si APPROVED `GET /api/v1/deliveries/:id` (también al abrir `/transactions/:id` por deep link) |
| Recuperación | `GET /api/v1/transactions?idempotencyKey=` (también ante un 422 `IDEMPOTENCY_CONFLICT`) |

Variables de build (`.env.example`):

```
VITE_API_BASE_URL=/api            # mismo origen vía CloudFront
VITE_PG_BASE_URL=                 # URL UAT *sandbox* de la pasarela (host con prefijo api-sandbox), para tokenizar
VITE_PG_PUBLIC_KEY=               # llave pública (es pública por diseño)
```

---

## 5. Features incrementales

Cada feature = **rama `feat/fe-XX-...` desde `main` + PR hacia `main`**. DoD común: lint/typecheck/stylelint en verde, tests nuevos, cobertura global ≥ 85 %, sin errores de `jsx-a11y`, probado en viewport 375×667.

### FE-00 · Scaffolding y tooling

- Vite `react-ts` en `apps/web`, TS strict, alias `@/`; `.nvmrc` con Node 24.
- ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier, Stylelint (`stylelint-config-standard`, CSS Modules).
- **Jest** con `jsdom`: `moduleNameMapper` para `\.module\.css$` → `identity-obj-proxy`, `\.(svg|png|jpg|avif|webp)$` → file mock, y `@/shared/config/env` → mock de test (Jest no entiende `import.meta.env`; por eso `env.ts` es el único módulo que lo lee). `setupFiles` con `test/setup/polyfills.ts` (`TextEncoder`/`TextDecoder` desde `node:util`, que React Router 7 necesita en jsdom — I-13) y `setupFilesAfterEnv` con `jest-dom`. `coverageThreshold.global` = 85 en las 4 métricas; excluir `main.tsx` y `*.d.ts`.
- `styles/tokens.css` (colores, espaciado 4-pt, radios, sombras, tipografía fluida con `clamp()`), `reset.css` moderno, `global.css`.
- `browserslist`: `> 0.5%, last 2 versions, not dead, iOS >= 15, Safari >= 15`.

**Aceptación:** `npm run lint && npm test && npm run build` pasan; página vacía renderiza sin scroll horizontal a 320 px.

### FE-01 · Store y arquitectura Flux

- `configureStore` con `thunk.extraArgument` tipado (`AppServices`), `RootState`, `AppDispatch`, hooks tipados.
- Slices vacíos de `catalog`, `checkout`, `transaction` con estado inicial y acciones base.
- `shared/lib/result.ts` (mismo concepto ROP que el backend: `ok`/`err`/`map`/`andThen`) para no usar excepciones como control de flujo en servicios.
- Helper de test `renderWithStore(ui, { preloadedState, services })`.

**Aceptación:** tests de reducers como funciones puras (estado + acción → estado).

### FE-02 · Capa HTTP y adaptadores

- `http-client.ts`: `fetch` + timeout (`AbortController`, 10 s) → `Promise<Result<T, ApiError>>`; parsea `application/problem+json` a `ApiError { code, status, message }`; mapea red/timeout a `NETWORK_ERROR`.
- `checkout-api.ts` (puerto `CheckoutApi`) con todos los métodos de la tabla §4.
- `card-tokenizer.ts` (puerto `CardTokenizer`): `POST {PG}/tokens/cards` con `Authorization: Bearer {PG_PUBLIC_KEY}`, body `{ number, cvc, exp_month, exp_year, card_holder }` (mes y año como strings de 2 dígitos) → `{ token, brand, lastFour, expiresAt }`.
- **Spike CORS (I-20), primer paso de la feature:** desde el navegador (dev server) llamar `OPTIONS`/`POST {PG}/tokens/cards` con una tarjeta de prueba y confirmar que la sandbox permite el origen. Si no lo permite, **plan B** documentado como ADR alterno: endpoint `POST /api/v1/card-tokens` en el backend que reenvía a la pasarela sin persistir ni loguear el body (redact) y sin tocar la DB; el puerto `CardTokenizer` no cambia, solo su adaptador.
- Fakes en `test/fakes`.

**Aceptación:** tests con `fetch` mockeado: 200, 4xx problem+json, 5xx, timeout, JSON inválido.

### FE-03 · UI kit accesible

- `Button` (variantes, `loading`), `TextField` (label, error, hint, prefijo/sufijo para el logo), `Select`, `Modal` (portal, focus trap, bottom sheet en móvil), **`Backdrop`** (back/front layer, transición `transform` 250 ms), `Spinner`, `Alert`, `Skeleton`.
- Estilos solo con tokens; mobile-first (`min-width` media queries); `@supports` para `dvh` con fallback a `vh`.

**Aceptación:** tests RTL de a11y básica (roles, foco al abrir/cerrar modal, `Esc`); evitar snapshots y preferir aserciones de comportamiento.

### FE-04 · Catálogo / página de producto (pasos 1 y 5)

- `fetchProducts` thunk; estados loading (skeletons con el mismo tamaño → sin CLS), error con "Reintentar", vacío.
- `ProductCard` con `ProductImage` (a partir del `imageKey` del backend compone `/images/products/{key}-{w}.{fmt}` — M-03; `<picture>` AVIF → WebP → JPG, `srcset` 320/640/960, `sizes`, `width`/`height` explícitos o `aspect-ratio`, `loading="lazy"` y `decoding="async"` salvo la primera imagen: `fetchpriority="high"`).
- `QuantitySelector` limitado por stock; `StockBadge`; botón "Pagar con tarjeta de crédito" → `checkoutStarted({ productId, quantity })` → step `PAYMENT_FORM`.
- Grid con `grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr))`.

**Aceptación:** producto con stock 0 muestra "Agotado" y botón deshabilitado; el selector no permite superar el stock; el click abre el modal.

### FE-05 · Formulario de tarjeta (paso 2a)

- Dominio puro: `luhnCheck`, `detectBrand` (VISA: `^4`, 13/16/19 dígitos; Mastercard: `51–55` o `2221–2720`, 16 dígitos), `formatCardNumber`, `isExpiryValid(month, year, now)` (futuro, ≤ 20 años), `isCvcValid` (3 dígitos), titular 5–40 caracteres (letras con tildes y espacios).
- `CardForm` con `react-hook-form` + schema zod que usa esas funciones; logo de marca en vivo (`CardBrandLogo`, que dibuja el `<svg>` con `path` y `hex` de `simple-icons` y `role="img"` + `aria-label` — I-11), estado "marca no soportada" para otras marcas (bloquea "Continuar").
- Selector de cuotas 1–36 (default 1).
- Si `cardReentryRequired` → `Alert` informativo.

**Aceptación:** tests de tabla para cada función (números válidos/ inválidos de prueba, límites de mes/año, rango 2221/2720); `4242 4242 4242 4242` muestra logo VISA, `5555 5555 5555 4444` Mastercard; errores visibles al hacer blur y al enviar.

### FE-06 · Datos de entrega, términos y tokenización (paso 2b)

- `DeliveryForm`: nombre, email, teléfono (`^3\d{9}$`), dirección 1/2, departamento (select con los 32 departamentos + Bogotá D.C.), ciudad, código postal opcional (6 dígitos).
- Borrador sincronizado a Redux con debounce (`deliveryDraftUpdated`) para la recuperación tras refresh — **solo entrega/cliente, nunca tarjeta**.
- `TermsAcceptance`: `fetchAcceptance` al abrir el modal; checkboxes obligatorios con links (`target="_blank" rel="noopener noreferrer"`).
- Thunk `submitPaymentForm`: `cardTokenizer.tokenize` → `api.registerCustomer` → `api.getQuote` → guarda `cardToken`, `cardTokenExpiresAt` (I-18), metadatos, `customerId`, `quote`, genera `idempotencyKey` **solo si no existe** (C-04) → step `SUMMARY`. Cualquier error se muestra dentro del modal sin perder lo escrito.

**Aceptación:** "Continuar" deshabilitado hasta que ambos formularios sean válidos y los términos aceptados; test del thunk con fakes cubre éxito y error en cada paso de la cadena.

### FE-07 · Resumen en Backdrop (paso 3)

- `SummaryBackdrop` con `selectOrderSummary` (desde `quote`), tarjeta enmascarada, dirección resumida, "Editar" (vuelve al modal conservando datos).
- Botón "Pagar {total}" → thunk `payOrder` → `POST /transactions` con `Idempotency-Key` → guarda `transaction.id/status/reference` → step `PROCESSING` → navega a `/transactions/:id`. Botón bloqueado mientras la petición está en vuelo (guarda en el thunk con `condition`, no solo en el botón).
- Manejo de errores de `payOrder`: token vencido antes de enviar → PAYMENT_FORM con `cardReentryRequired`; 409 `INSUFFICIENT_STOCK` → mensaje y vuelta al producto con stock refrescado; 422 `IDEMPOTENCY_CONFLICT` → `GET ?idempotencyKey` y continuar con esa transacción; 503 / red → mensaje "No pudimos confirmar el pago" y botón "Reintentar" con la **misma** key (seguro gracias a la idempotencia).

**Aceptación:** doble click dispara una sola petición (test); el total mostrado coincide con el quote del backend; cada rama de error anterior tiene su test.

### FE-08 · Procesamiento y estado final (paso 4 → 5)

- `polling.listener.ts` (listener middleware): mientras `status === 'PENDING'`, `GET /transactions/:id` con intervalos 2 s, 2 s, 3 s, 3 s, 5 s… hasta 90 s; pausa si `document.hidden`; se cancela al salir de la página. Al vencer → `polling: 'timeout'` con botón "Consultar de nuevo".
- `TransactionStatusPage`: vistas por estado (§3), `GET /deliveries/:id` si APPROVED.
- "Volver a la tienda" → `checkoutReset()` (limpia storage) → navega a `/` → `fetchProducts()` (stock actualizado). Auto-redirect de 10 s cancelable.
- `TransactionStatusPage` funciona por deep link sin estado persistido (I-10).
- "Intentar con otra tarjeta" → `retryWithAnotherCard()`.

**Aceptación:** tests con fake timers: PENDING→APPROVED detiene el polling; timeout muestra estado correcto; al volver, el catálogo se vuelve a pedir.

### FE-09 · Resiliencia (recuperación tras refresh)

- `persisted-state.schema.ts` (zod), `loadPersistedState`, `persistence.listener.ts`, `checkoutRecovered` con la tabla de §2.4, incluyendo la recuperación por `idempotencyKey`.

**Aceptación:** un test por fila de la tabla §2.4 (incluido el deep link); la `idempotencyKey` se conserva tras refresh + re-captura y solo cambia con `retryWithAnotherCard`; estado corrupto/expirado/versión vieja → arranque limpio; el `cardToken` nunca aparece en `localStorage` (test explícito).

### FE-10 · Pulido responsive, CSS, cross-browser y performance

- Revisión en 320, 375×667 (iPhone SE), 390, 768, 1024, 1440 px: sin scroll horizontal, sin textos cortados, CTA siempre visible (sticky footer en el modal).
- CSS avanzado con propósito: container queries en `ProductCard`, `clamp()` para tipografía, `:has()` solo como mejora progresiva, animaciones con `transform/opacity`, soporte de modo oscuro por `prefers-color-scheme` vía tokens.
- `scripts/optimize-images.mjs` (sharp) y verificación de peso (< 80 KB por variante 640 px).
- Code splitting: `PaymentModal` y `TransactionStatusPage` con `React.lazy`.
- Medición con Lighthouse (móvil) antes de entregar, con los resultados en el README: objetivo Performance ≥ 90, Accessibility ≥ 95, LCP < 2.5 s, CLS < 0.1.
- Matriz manual: Chrome, Firefox, Safari (macOS/iOS), Edge; capturas en README.

### FE-11 · Cobertura y documentación

- Completar tests hasta ≥ 90 % real; reporte `jest --coverage` (`text-summary` + `lcov`) pegado en README.
- README front: cómo correr, variables, arquitectura Flux, decisiones de seguridad, tarjetas de prueba, capturas móviles.

---

## 6. Estrategia de pruebas

| Nivel | Qué | Cómo |
|---|---|---|
| Funciones puras | Luhn, marca, expiración, formato COP, schema persistencia | Tests de tabla (`it.each`) |
| Reducers / selectors | Transiciones de paso, reset, recuperación | Estado + acción → estado |
| Thunks / listeners | Cadenas de efectos y ramas de error | `extraArgument` con fakes, `jest.useFakeTimers()` para polling |
| Componentes | Interacción real del usuario | RTL + `user-event`, consultas por rol/label, sin testear detalles de implementación |
| Flujo completo | Pasos 1→5 aprobado y rechazado | Test de integración con store real + fakes de API/tokenizer |

Umbral CI 85 % (branches, functions, lines, statements); objetivo ≥ 90 %.
