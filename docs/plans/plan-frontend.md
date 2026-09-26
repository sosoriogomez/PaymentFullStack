# Plan de implementación — Frontend (`apps/web`)

> Deriva de [`spec-frontend.md`](../specs/spec-frontend.md) v1.1. El spec define **qué** (flujo, estado, UX, contrato); este plan define **cómo**: arquitectura de código, patrones, librerías, CSS, tests y orden de trabajo. Ante una contradicción manda el spec, y se corrige el plan.

---

## 0. Objetivo y reglas del juego

- SPA **React 19 + Redux Toolkit (Flux)**, mobile-first (referencia 375×667 CSS px del iPhone SE 2020), que implementa las 5 pantallas del enunciado, recupera el progreso tras un refresh y maneja datos sensibles de forma segura.
- Apunta a los bonus de **CSS**, **responsive/cross-browser**, **clean code** y **OWASP** (junto con los headers de CloudFront).
- **Test-first** a partir de los criterios de aceptación; cobertura ≥ 85 % en CI (el enunciado exige > 80 %).
- **Una feature = rama `feat/fe-<nn>-<slug>` desde `main` + PR hacia `main`**, commits convencionales pequeños.
- **Regla de nombres:** ningún texto, variable, comentario ni asset menciona a la compañía evaluadora; en la UI se habla de "pago con tarjeta" y en el código de `PaymentGateway`/`PG`.

---

## 1. Lenguaje y librerías

| Área | Elección (versión mayor) | Uso concreto |
|---|---|---|
| Lenguaje | TypeScript 5.x `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` | Tipos en estado, acciones y dominio de tarjeta |
| UI | `react` / `react-dom` 19 | Componentes funcionales + hooks |
| Build | `vite` 7 + `@vitejs/plugin-react` | Dev server, code splitting, assets con hash |
| Estado (Flux) | `@reduxjs/toolkit` 2 + `react-redux` 9 | Slices, thunks, listener middleware, selectores memoizados |
| Routing | `react-router` 7 (modo librería, `createBrowserRouter`) | `/` y `/transactions/:id` |
| Formularios | `react-hook-form` 7 + `zod` 4 + `@hookform/resolvers` 5 | Estado local del formulario (la tarjeta nunca va a Redux) |
| Validación de fronteras | `zod` 4 | Respuestas de la API y de la pasarela, y estado persistido |
| Íconos de marca | `simple-icons` (datos SVG, CC0) | Logos VISA / Mastercard sin assets externos |
| Estilos | CSS Modules + custom properties + `@layer`; PostCSS `autoprefixer` | Sin framework CSS (bonus CSS) |
| Imágenes | `sharp` (devDependency, script) | Variantes AVIF/WebP/JPG × 320/640/960 |
| Tests | `jest` 30, `@swc/jest`, `jest-environment-jsdom`, `@testing-library/react` 16, `@testing-library/user-event` 14, `@testing-library/jest-dom` 6, `identity-obj-proxy` | Unit, componentes e integración del flujo |
| Calidad | `eslint` 9 + `typescript-eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y` + `eslint-plugin-import`; `stylelint` 16 + `stylelint-config-standard` + `stylelint-config-css-modules`; `prettier`; `husky` + `lint-staged` | Clean code y accesibilidad verificables |
| Performance | Lighthouse (Chrome DevTools, manual) | Evidencia de imágenes rápidas y sin CLS |

No se usa librería de componentes: el UI kit propio (Modal, Backdrop, TextField…) es parte de lo que se evalúa en CSS y accesibilidad.

---

## 2. Arquitectura

### 2.1 Capas y regla de dependencias

```
src/
├── app/        # composición: store, router, providers, persistencia. Puede importar todo.
├── features/   # catalog, checkout, transaction: slice + thunks + selectors + domain + components + pages
└── shared/     # api (adaptadores), lib (puras), ui (kit), config, i18n. No importa features ni app.
```

- `shared/` no conoce `features/`; una feature solo importa de otra lo que esta exporta en su `index.ts` (selectores y acciones públicas). Se verifica con `import/no-restricted-paths`.
- **Reducers puros**; todos los efectos (HTTP, pasarela, storage, timers, visibilidad de la página) viven en thunks o en el listener middleware.
- **Ports & Adapters en el front:** los efectos usan servicios inyectados por `thunk.extraArgument` y por `createListenerMiddleware({ extra })`:

```ts
// app/services.ts
export interface AppServices {
  api: CheckoutApi;               // shared/api/checkout-api.ts
  cardTokenizer: CardTokenizer;   // shared/api/card-tokenizer.ts
  storage: KeyValueStorage;       // shared/lib/storage.ts (localStorage con degradación a memoria)
  idGenerator: IdGenerator;       // crypto.randomUUID
  clock: Clock;                   // Date.now
  pageVisibility: PageVisibility; // document.hidden + visibilitychange
}
```

En los tests se inyectan fakes de cada puerto: nada de `jest.mock` de módulos propios.

### 2.2 Patrones y dónde se aplican

| Patrón | Dónde | Por qué |
|---|---|---|
| Flux (unidireccional) | View → `dispatch` → reducers puros → selectors → View | Requisito del enunciado; estado predecible y testeable |
| Ports & Adapters | `AppServices`; adaptadores en `shared/api` y `shared/lib` | Efectos sustituibles por fakes; la UI no conoce `fetch` |
| Container / Presentational | `ProductPageContainer` → `ProductCard` | Los presentacionales se testean con props, sin store |
| Selectores memoizados | `createSelector` (`selectOrderSummary`, `selectCanPay`, `selectPersistableState`) | Derivar en lugar de duplicar estado |
| Listener middleware (sagas ligeras) | `polling.listener.ts`, `persistence.listener.ts` | Efectos de larga duración, cancelables y testeables con fake timers |
| Result (ROP) | `http-client.ts` y servicios devuelven `Result<T, ApiError>` | Sin excepciones como control de flujo; ramas de error explícitas |
| Adapter con degradación | `storage.ts` (Safari privado o cuota llena → memoria) | Resiliencia |
| Funciones puras de dominio | `checkout/domain/*` (Luhn, marca, formato, expiración) | 100 % testeables con tablas |
| Custom hooks | `useFocusTrap`, `useCountdown`, `useMediaQuery`, `useDebouncedCallback` | Lógica de UI reutilizable y aislada |
| Code splitting | `React.lazy` para `PaymentModal` y `TransactionStatusPage` con *prefetch* en idle | Menos JS en la primera carga |

### 2.3 Convenciones de código

- Componentes `PascalCase.tsx` con su `PascalCase.module.css` al lado; hooks `useX.ts`; slices `x.slice.ts`; tests `*.test.ts(x)` junto al archivo.
- Componentes ≤ ~120 líneas y una responsabilidad; props tipadas con `interface`, sin `React.FC`.
- Pasos y estados como uniones `as const` (`CHECKOUT_STEPS`), nunca strings sueltos.
- Montos siempre en centavos enteros; se formatean solo al renderizar con `formatCOP`.
- El front **nunca calcula el total cobrado**: lo muestra desde el quote del backend.
- Textos de UI en `shared/i18n/es.ts` (objeto `as const`, funciones para textos con parámetros); los errores de la API se traducen por `code`.
- Accesibilidad desde el primer componente: labels visibles, `aria-invalid` + `aria-describedby`, foco gestionado, objetivos táctiles ≥ 44 px.
- Prohibido `dangerouslySetInnerHTML`; `console.*` solo en desarrollo (regla de lint).

---

## 3. Diseño de código clave

### 3.1 Store

```ts
// app/store.ts
export const rootReducer = combineSlices(catalogSlice, checkoutSlice, transactionSlice);
export type RootState = ReturnType<typeof rootReducer>;

export function createAppStore(services: AppServices, preloadedState?: Partial<RootState>) {
  const listener = createListenerMiddleware({ extra: services });
  registerPersistenceListener(listener);
  registerPollingListener(listener);
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    devTools: env.isDevelopment,
    middleware: (getDefault) =>
      getDefault({ thunk: { extraArgument: services } }).prepend(listener.middleware),
  });
}
export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];

// app/hooks.ts
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState; dispatch: AppDispatch; extra: AppServices; rejectValue: UiError;
}>();
```

### 3.2 Thunk del formulario de pago (cadena ROP)

```ts
export const submitPaymentForm = createAppAsyncThunk(
  'checkout/submitPaymentForm',
  async (form: PaymentFormValues, { getState, extra, rejectWithValue }) => {
    const { productId, quantity, idempotencyKey } = selectCheckout(getState());
    const result = await AsyncResult.from(extra.cardTokenizer.tokenize(toCardInput(form.card)))
      .andThen((card) => extra.api.registerCustomer(toCustomerInput(form.contact))
        .then((r) => map(r, (customer) => ({ card, customer }))))
      .andThen((ctx) => extra.api.getQuote({ productId, quantity })
        .then((r) => map(r, (quote) => ({ ...ctx, quote }))));
    if (!result.ok) return rejectWithValue(toUiError(result.error));
    return { ...result.value, idempotencyKey: idempotencyKey ?? extra.idGenerator.uuid() }; // C-04
  },
);
```

Los datos de la tarjeta (PAN, CVC, vencimiento) solo existen en `react-hook-form` y en la llamada a `tokenize`; al slice llegan `brand`, `lastFour`, `holderName`, `token` y `expiresAt`.

### 3.3 Polling cancelable (listener)

```ts
startAppListening({
  actionCreator: pollingStarted,
  effect: async ({ payload }, api) => {
    api.cancelActiveListeners();
    const task = api.fork((fork) => pollUntilFinal(payload.transactionId, fork, api.extra, api.dispatch));
    await Promise.race([task.result, api.take(isAnyOf(pollingStopped, checkoutReset))]);
    task.cancel();
  },
});

async function pollUntilFinal(id: string, fork: ForkedTaskAPI, services: AppServices, dispatch: AppDispatch) {
  const startedAt = services.clock.now();
  for (const delayMs of POLLING_DELAYS_MS) {                 // [2000, 2000, 3000, 3000, 5000, 5000, …]
    if (services.clock.now() - startedAt >= POLLING_MAX_MS) return dispatch(pollingTimedOut());
    await fork.delay(delayMs);                                // cancelable
    if (services.pageVisibility.isHidden()) await fork.pause(services.pageVisibility.whenVisible());
    const result = await services.api.getTransaction(id);
    if (result.ok) dispatch(transactionUpdated(result.value));
    if (result.ok && isFinalStatus(result.value.status)) return;
  }
  dispatch(pollingTimedOut());
}
```

### 3.4 Persistencia y recuperación

```ts
startAppListening({
  predicate: (action) => isCheckoutAction(action) || isTransactionAction(action),
  effect: async (_action, api) => {
    api.cancelActiveListeners();          // debounce
    await api.delay(PERSIST_DEBOUNCE_MS); // 300 ms
    savePersistedState(api.extra.storage, api.extra.clock, selectPersistableState(api.getState()));
  },
});
```

- `selectPersistableState` excluye `cardToken`, `cardTokenExpiresAt` y `acceptance`.
- `loadPersistedState(storage, clock)` valida con zod, versión (`v1`) y TTL (30 min); ante cualquier fallo borra la llave y devuelve `undefined`.
- `checkoutRecovered()` normaliza el paso según la tabla del spec §2.4 (C-04, I-10) y, si hace falta, dispara `recoverByIdempotencyKey` (3 intentos con backoff).

### 3.5 Dominio de tarjeta (funciones puras)

```ts
export const luhnCheck = (digits: string): boolean => {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
};

const BRAND_RULES = [
  { brand: 'VISA', prefix: /^4/, lengths: [13, 16, 19] },
  { brand: 'MASTERCARD', prefix: /^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/, lengths: [16] },
] as const satisfies readonly BrandRule[];

export const detectBrand = (digits: string): CardBrand =>
  BRAND_RULES.find((rule) => rule.prefix.test(digits))?.brand ?? 'UNKNOWN';
```

Más `formatCardNumber` (grupos de 4) y `nextCaretPosition(formatted, digitsBeforeCaret)` para no romper el cursor al editar en medio, `isExpiryValid(month, year, now)` (mes 1–12, no vencida, ≤ 20 años), `isCvcValid` (3 dígitos), `isHolderNameValid` (5–40, letras con tildes y espacios).

### 3.6 Componentes clave

- `CardBrandLogo`: `<svg role="img" aria-label={icon.title} viewBox="0 0 24 24"><path d={icon.path} fill={`#${icon.hex}`} /></svg>` a partir de `siVisa` / `siMastercard` (I-11).
- `ProductImage`: `<picture>` con `<source type="image/avif">`, `<source type="image/webp">` e `<img>` JPG; `srcSet` 320/640/960 compuesto desde `imageKey`; `sizes="(min-width: 1024px) 33vw, (min-width: 600px) 50vw, 100vw"`; `width`/`height` explícitos; `loading="lazy"` + `decoding="async"`, salvo la primera (`loading="eager"`, `fetchPriority="high"`).
- `Modal`: portal, `role="dialog"`, `aria-modal`, `aria-labelledby`, `useFocusTrap`, `inert` en el resto de la app, `Esc` (salvo en PROCESSING), foco devuelto al trigger; bottom sheet en móvil y diálogo de 480 px desde 600 px.
- `Backdrop` (Material): *back layer* con el contexto del producto (queda `inert`) y *front layer* que sube con `transform: translateY()` en 250 ms; foco al título del front layer al abrir.
- `SummaryBackdrop`: desglose desde `selectOrderSummary`, tarjeta `VISA •••• 4242`, dirección resumida, "Editar" y botón "Pagar {total}" deshabilitado mientras hay una petición en vuelo.

### 3.7 Arquitectura CSS

- `styles/tokens.css`: colores semánticos (`--color-surface`, `--color-text`, `--color-accent`, `--color-danger`…), escala de espaciado de 4 pt, radios, sombras, duraciones y tipografía fluida con `clamp()`; un bloque `@media (prefers-color-scheme: dark)` que solo redefine tokens.
- `global.css` declara el orden de capas `@layer reset, tokens, base, components, utilities;` para controlar la especificidad sin `!important`.
- CSS Modules por componente, que solo consumen tokens (Stylelint prohíbe colores literales fuera de `tokens.css`).
- Mobile-first con `min-width` en 600 / 1024 / 1440 px; grid del catálogo `repeat(auto-fill, minmax(min(100%, 280px), 1fr))`; `container-type: inline-size` en `ProductCard` para adaptar la tarjeta a su ancho, no al viewport.
- `100dvh` con fallback `100vh` vía `@supports`; `env(safe-area-inset-*)` en el bottom sheet y el footer sticky; propiedades lógicas (`padding-inline`, `margin-block`).
- Animaciones solo con `transform`/`opacity`; `@media (prefers-reduced-motion: reduce)` las desactiva.
- `:focus-visible` con anillo de alto contraste; `:has()` solo como mejora progresiva (p. ej. resaltar el campo con error).

---

## 4. Plan por features

### FE-00 · Scaffolding y tooling — `feat/fe-00-scaffolding`

**Pasos**
1. `npm create vite@latest web -- --template react-ts` en `apps/`; TS estricto, alias `@/`, `.nvmrc`.
2. ESLint (flat config con react-hooks, jsx-a11y, import y restricciones de capas), Stylelint, Prettier, lint-staged.
3. `jest.config.ts`:
   ```ts
   export default {
     testEnvironment: 'jsdom',
     setupFiles: ['<rootDir>/test/setup/polyfills.ts'],            // TextEncoder/TextDecoder (I-13)
     setupFilesAfterEnv: ['<rootDir>/test/setup/jest-dom.ts'],
     transform: { '^.+\\.(t|j)sx?$': ['@swc/jest', { jsc: { transform: { react: { runtime: 'automatic' } } } }] },
     transformIgnorePatterns: ['/node_modules/(?!simple-icons)'],   // paquete ESM
     moduleNameMapper: {
       '^@/shared/config/env$': '<rootDir>/test/mocks/env.ts',      // Jest no entiende import.meta.env
       '\\.module\\.css$': 'identity-obj-proxy',
       '\\.css$': '<rootDir>/test/mocks/style.ts',
       '\\.(svg|png|jpg|avif|webp)$': '<rootDir>/test/mocks/file.ts',
       '^@/(.*)$': '<rootDir>/src/$1',
     },
     collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/main.tsx', '!src/**/*.d.ts'],
     coverageThreshold: { global: { branches: 85, functions: 85, lines: 85, statements: 85 } },
   };
   ```
4. `shared/config/env.ts` como único lector de `import.meta.env` (validado con zod: `VITE_API_BASE_URL`, `VITE_PG_BASE_URL`, `VITE_PG_PUBLIC_KEY`).
5. `styles/tokens.css`, `reset.css`, `global.css`; `browserslist` (`> 0.5%, last 2 versions, not dead, iOS >= 15, Safari >= 15`); `.env.example`.

**Aceptación:** `npm run lint && npm run stylelint && npm test && npm run build` pasan; la página vacía no tiene scroll horizontal a 320 px.

### FE-01 · Store y Flux — `feat/fe-01-store`

`createAppStore(services)`, slices `catalog`, `checkout` y `transaction` con estado inicial y acciones base, `hooks.ts`, `shared/lib/result.ts` (misma API conceptual que el backend), `test/renderWithStore.tsx` (`renderWithStore(ui, { preloadedState, services })`) y `test/fakes/*`. Tests: reducers como funciones puras.

### FE-02 · Capa HTTP y adaptadores — `feat/fe-02-http-adapters`

**Pasos**
1. **Spike CORS (I-20), lo primero:** desde el dev server, tokenizar `4242 4242 4242 4242` contra la sandbox. Si el origen es rechazado, activar el plan B (proxy en el backend, ADR alterno) antes de seguir; el puerto `CardTokenizer` no cambia.
2. `http-client.ts`: `fetch` + `AbortSignal.timeout(10_000)` → `Result<T, ApiError>`; parsea `application/problem+json` a `ApiError { code, status, detail }`; red o timeout → `NETWORK_ERROR`; valida el body con el schema zod de cada endpoint.
3. `checkout-api.ts` (puerto `CheckoutApi`, todos los endpoints del spec §4, incluido `getProductStock`); `card-tokenizer.ts` (mes y año de 2 dígitos, devuelve `expiresAt`).

**Tests:** `fetch` mockeado: 200, 4xx problem+json, 5xx, timeout, JSON inválido, body que no cumple el schema.

### FE-03 · UI kit accesible — `feat/fe-03-ui-kit`

`Button` (variantes, `loading`), `TextField` (label, hint, error, slot para el logo), `Select`, `Checkbox`, `Modal`, `Backdrop`, `Spinner`, `Alert` (`role="alert"` / `status`), `Skeleton`; hooks `useFocusTrap`, `useMediaQuery`. Tests RTL por comportamiento: roles, foco al abrir y al cerrar, `Esc`, `inert` del fondo. Sin snapshots.

### FE-04 · Catálogo (pasos 1 y 5) — `feat/fe-04-catalog`

`fetchProducts` thunk; estados loading (skeletons del mismo tamaño → sin CLS), error con "Reintentar" y vacío; `ProductCard`, `ProductImage`, `StockBadge`, `QuantitySelector` (1…min(stock, 10)); botón "Pagar con tarjeta de crédito" → `checkoutStarted({ productId, quantity })`. Script `scripts/optimize-images.mjs` (sharp: AVIF q50, WebP q70, JPG mozjpeg q75; falla si la variante de 640 px pesa > 80 KB) a partir de fotos libres de derechos (licencia citada en el README).

**Tests:** stock 0 → "Agotado" y botón deshabilitado; el selector no supera el stock; el click abre el modal.

### FE-05 · Formulario de tarjeta (paso 2a) — `feat/fe-05-card-form`

Funciones puras de §3.5 con tests de tabla (números de prueba válidos e inválidos, límites de mes y año, rangos 2221/2720); `cardSchema` (zod) que usa esas funciones; `CardForm` con `react-hook-form` (`mode: 'onTouched'`), `inputMode="numeric"`, `autoComplete` `cc-*`, formato en vivo sin saltos de cursor, `CardBrandLogo`, "marca no soportada", cuotas 1–36 y `Alert` si `cardReentryRequired`.

**Tests:** `4242…` muestra VISA; `5555 5555 5555 4444` Mastercard; errores visibles al hacer blur y al enviar.

### FE-06 · Entrega, términos y tokenización (paso 2b) — `feat/fe-06-delivery-terms`

`DeliveryForm` (nombre, email, teléfono `^3\d{9}$`, dirección 1/2, departamento con los 32 departamentos + Bogotá D.C., ciudad, código postal opcional de 6 dígitos); borrador sincronizado a Redux con debounce (`deliveryDraftUpdated`), nunca la tarjeta; `TermsAcceptance` con `fetchAcceptance` al abrir el modal y links `target="_blank" rel="noopener noreferrer"`; `PaymentModal` que compone ambos formularios; thunk `submitPaymentForm` (§3.2).

**Tests:** "Continuar" deshabilitado hasta que todo sea válido y los términos estén aceptados; el thunk con fakes cubre el éxito y el error de cada paso de la cadena; la `idempotencyKey` existente se conserva.

### FE-07 · Resumen en Backdrop (paso 3) — `feat/fe-07-summary-backdrop`

`SummaryBackdrop`, `selectOrderSummary`, "Editar" (vuelve al modal conservando los datos), thunk `payOrder` con `condition` (no se despacha si ya hay una petición en vuelo) y las ramas de error del spec FE-07 (token vencido, 409, 422, 503). El contenedor navega a `/transactions/:id` cuando el paso pasa a PROCESSING (los thunks no navegan).

**Tests:** doble click → una sola petición; el total mostrado coincide con el quote; un test por rama de error.

### FE-08 · Procesamiento y estado final (pasos 4 → 5) — `feat/fe-08-transaction-status`

`polling.listener.ts` (§3.3), `TransactionStatusPage` con vistas por estado (Aprobada / Rechazada / Error / "Estamos confirmando tu pago"), `reference`, montos, entrega si APPROVED (`GET /deliveries/:id`), "Consultar de nuevo" tras el timeout, "Volver a la tienda" (`checkoutReset` → `/` → `fetchProducts` + `getProductStock`), "Intentar con otra tarjeta" (`retryWithAnotherCard`, nueva key), auto-redirect de 10 s con contador visible y "Quedarme aquí" (`useCountdown`), deep link sin estado (I-10).

**Tests (fake timers):** PENDING → APPROVED detiene el polling; timeout → vista correcta; `document.hidden` pausa; al volver se vuelve a pedir el catálogo; deep link carga por id.

### FE-09 · Resiliencia tras refresh — `feat/fe-09-persistence`

`persisted-state.schema.ts`, `loadPersistedState`, `savePersistedState`, `persistence.listener.ts` (§3.4), `checkoutRecovered` con la tabla corregida y `recoverByIdempotencyKey`.

**Tests:** un test por fila de la tabla §2.4 (incluido el deep link); la key se conserva tras refresh + re-captura; estado corrupto, vencido o de otra versión → arranque limpio; el `cardToken` nunca aparece en `localStorage`.

### FE-10 · Responsive, CSS, cross-browser y performance — `feat/fe-10-polish`

Revisión en 320, 375×667, 390, 768, 1024 y 1440 px (sin scroll horizontal, sin textos cortados, CTA siempre visible con footer sticky); container queries, `clamp()`, modo oscuro por tokens, `prefers-reduced-motion`; `React.lazy` + prefetch en idle de `PaymentModal` y `TransactionStatusPage`; medición manual con Lighthouse en móvil, registrada en el README (Performance ≥ 90, Accessibility ≥ 95, LCP < 2.5 s, CLS < 0.1); matriz manual Chrome, Firefox, Safari macOS/iOS y Edge con capturas.

### FE-11 · Cobertura y documentación — `feat/fe-11-coverage-docs`

Test de integración del flujo completo (store real + fakes) para aprobado y rechazado; completar hasta ≥ 90 %; reporte `text-summary` + `lcov`; sección frontend del README (cómo correr, variables, arquitectura Flux, seguridad, tarjetas de prueba, capturas móviles).

---

## 5. Checklist de cumplimiento del enunciado (frontend)

| Requisito | Dónde |
|---|---|
| SPA en React | FE-00 |
| Redux obligatorio siguiendo Flux | §2.1, §3.1, FE-01 |
| Datos de la transacción en el estado y/o `localStorage`, de forma segura | FE-09 (sin datos sensibles, TTL, validación zod) |
| Mobile-first; mínimo iPhone SE 2020; nada fuera de los límites | §3.7, FE-10 |
| Producto con descripción, precio y unidades en stock | FE-04 |
| Botón "Pagar con tarjeta de crédito" que abre un modal | FE-04, FE-06 |
| Tarjeta validada con estructura real + logos VISA/Mastercard | FE-05 |
| Datos de entrega | FE-06 |
| Resumen con monto del producto + base fee + delivery fee y botón de pago en un Backdrop | FE-07 |
| Resultado final y regreso al producto con el stock actualizado | FE-08 |
| Recuperar el progreso tras un refresh | FE-09 |
| Flexbox / grid; imágenes rápidas | §3.7, FE-04, FE-10 |
| Jest > 80 % | Umbral 85 % en CI |

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La sandbox no permite CORS para tokenizar desde el navegador | Spike al inicio de FE-02 + plan B sin cambiar el puerto |
| Doble cobro por doble click o refresh | Guarda en el thunk + `Idempotency-Key` estable (ADR-006) |
| Paquetes ESM rompen Jest | `transformIgnorePatterns` y mocks centralizados |
| CLS o LCP altos por imágenes | Dimensiones explícitas, AVIF/WebP, `fetchPriority` en la primera y medición con Lighthouse antes de entregar |
| Diferencias entre Safari iOS y Chrome | `dvh` con fallback, safe areas, pruebas en dispositivo real antes de entregar |

## 7. Definition of Done (todas las features)

- [ ] Tests de aceptación escritos primero y en verde; cobertura global ≥ 85 %.
- [ ] `lint`, `stylelint`, `typecheck` y `build` sin errores; sin errores de `jsx-a11y`.
- [ ] Probado a 375×667 y a 320 px sin scroll horizontal.
- [ ] Ningún dato de tarjeta en Redux, storage ni logs; sin el nombre de la compañía en textos ni código.
- [ ] PR con plantilla completa y CI en verde antes del merge a `main`.
