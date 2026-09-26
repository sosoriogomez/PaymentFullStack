# Checkout Onboarding — Visión general de specs

> **Versión 1.2** — incorpora las correcciones de la revisión y el ajuste de alcance (S-01, S-02); el detalle de cada cambio y su motivo está en [`CHANGELOG.md`](./CHANGELOG.md). Los planes de implementación derivados están en [`../plans/`](../plans/).

Índice y hoja de ruta de los tres specs de implementación:

| Spec | Contenido | Features |
|---|---|---|
| [`spec-backend.md`](./spec-backend.md) | API NestJS, hexagonal + ROP, PostgreSQL, integración con la pasarela | BE-00 … BE-14 |
| [`spec-frontend.md`](./spec-frontend.md) | SPA React + Redux Toolkit (Flux), mobile-first, flujo de 5 pasos | FE-00 … FE-11 |
| [`spec-cloud.md`](./spec-cloud.md) | AWS con CDK, CloudFront + S3 + API Gateway + Lambda + RDS, CI/CD, seguridad | CL-00 … CL-09 |

> **Regla de nombres (obligatoria por la prueba):** el repositorio público **no puede contener el nombre de la compañía evaluadora** — ni en código, ni en commits, ni en estos specs. Se usa "Payment Gateway (PG)" / "pasarela". CI lo verifica con una lista de palabras guardada como secreto (CL-06).

---

## 1. Decisiones de stack (resumen)

| Capa | Elección |
|---|---|
| Frontend | React 19 + TypeScript + Vite + **Redux Toolkit** (Flux) + React Router + react-hook-form/zod + CSS Modules (flex/grid) |
| Backend | Node 24 + TypeScript + **NestJS** + **Hexagonal (Ports & Adapters)** + **ROP** (`Result`/`AsyncResult`) + TypeORM + PostgreSQL 16 |
| Tests | **Jest** en front, back e infra. Umbral CI 85 % (exigido > 80 %) |
| Cloud | AWS CDK (TS): CloudFront (mismo origen para SPA y `/api`), S3 + OAC, API Gateway HTTP API, Lambda (Node 24, arm64), RDS PostgreSQL privado, NAT instance, SSM + Secrets Manager, EventBridge Scheduler |
| CI/CD | GitHub Actions + OIDC |

Decisiones clave documentadas como ADR en `docs/adr/`:

1. **ADR-001** Stock se descuenta al aprobar (decremento atómico condicional), no se reserva al crear.
2. **ADR-002** Tokenización de la tarjeta en el cliente con llave pública: el PAN nunca toca nuestra API.
3. **ADR-003** Estrategia de confirmación del pago: polling del cliente con sincronización server-side + reconciliación programada; webhook como complemento (la cuenta sandbox es compartida y no se debe reconfigurar).
4. **ADR-004** Lambda + RDS privada con NAT instance y CloudFront como único origen.
5. **ADR-005** Build de Lambda en dos pasos (tsc → esbuild) porque esbuild no emite `emitDecoratorMetadata`.
6. **ADR-006** Idempotencia con *fingerprint* que excluye credenciales de un solo uso: la misma `Idempotency-Key` sobrevive a la re-captura de tarjeta y no hay doble cobro tras un refresh.
7. **ADR-007** Reconciliación programada de transacciones PENDING (EventBridge Scheduler cada 5 min).

---

## 2. Estructura del monorepo

```
checkout-onboarding/
├── apps/
│   ├── api/            # spec-backend
│   └── web/            # spec-frontend
├── infra/              # spec-cloud
├── docs/
│   ├── adr/
│   ├── plans/          # planes de implementación por parte (back, front, cloud)
│   ├── postman/
│   ├── security/       # README.md (checklist OWASP) + capturas
│   └── specs/          # estos archivos + CHANGELOG.md
├── .github/workflows/
├── package.json        # npm workspaces: apps/*, infra
└── README.md
```

---

## 3. Hoja de ruta incremental

Orden recomendado (cada ítem = rama desde `main` + PR hacia `main`; commits pequeños y frecuentes — la prueba anula repos sin progreso visible):

| Fase | Features | Resultado verificable |
|---|---|---|
| 1. Cimientos | CL-00, BE-00, FE-00, CL-06 | Monorepo con lint/test/build y CI en verde |
| 2. Núcleo | BE-01, BE-02, FE-01, FE-02, FE-03 | ROP, DB con seed, store Flux, cliente HTTP, UI kit |
| 3. Catálogo end-to-end | BE-03, FE-04 | Paso 1 funcionando local con stock real |
| 4. Walking skeleton en AWS | CL-01, CL-02, CL-03, CL-04, CL-05, CL-07, BE-12 | URL pública mostrando el catálogo por HTTPS |
| 5. Checkout | BE-04, BE-05, BE-06, FE-05, FE-06 | Modal con tarjeta, entrega, términos y tokenización |
| 6. Pago | BE-07, BE-08, BE-09, FE-07, FE-08 | Pasos 3 → 4 → 5 con pagos aprobados y rechazados |
| 7. Resiliencia y eventos | FE-09, BE-10, BE-14 (+ Scheduler y `ReconcileFunction` de CL-04) | Refresh en cualquier paso recupera el progreso; ninguna transacción queda PENDING aunque el cliente se vaya |
| 8. Hardening | BE-11, FE-10, CL-09 | Headers OWASP, responsive/cross-browser, verificación de seguridad |
| 9. Cierre | BE-13, FE-11 | Swagger/Postman, cobertura y README final |

---

## 4. Trazabilidad requisito → feature

| Requisito de la prueba | Features |
|---|---|
| UI con producto, descripción, precio y unidades en stock | FE-04, BE-03 |
| Botón "Pagar con tarjeta de crédito" que abre modal | FE-04, FE-03 |
| Validación de tarjeta con estructura real + detección VISA/Mastercard con logos | FE-05 |
| Datos de entrega | FE-06, BE-05, BE-07 |
| Resumen: monto producto + base fee + delivery fee, botón de pago en Backdrop | FE-07, FE-03, BE-04 |
| Crear transacción PENDING en backend y obtener número | BE-07 |
| Llamar a la API de la pasarela para completar el pago | BE-06, BE-07, FE-06 (tokenización) |
| Al finalizar: actualizar transacción, asignar entrega, actualizar stock | BE-08, BE-09, BE-10, BE-14 |
| Mostrar resultado y volver al producto con stock actualizado | FE-08 |
| Flujo de 5 pantallas | FE-04 … FE-08 |
| App resiliente: recuperar progreso tras refresh | FE-09, BE-07 (lookup por idempotency key + fingerprint sin tokens, ADR-006), BE-14 |
| Manejo seguro de datos sensibles | FE-06 (ADR-002), BE-01 (redact), BE-11, CL-03, CL-05 (CSP) |
| API con stock, transactions, customers, deliveries y distintos tipos de request | BE-03 (incl. `GET /products/:id/stock`), BE-05, BE-07, BE-08, BE-09 |
| Validaciones por endpoint pensando en casos reales | BE-04 … BE-10 (idempotencia, stock, estados finales, timeouts) |
| Diseño de API y arquitectura de información (DB, carpetas) | spec-backend §3–§5 |
| Postman o Swagger público en README | BE-13, CL-05 |
| Modelo de datos en README | BE-02, BE-13 |
| SPA React, Redux obligatorio (Flux), datos de transacción en estado/localStorage | FE-01, FE-09 |
| Mobile oriented, mínimo iPhone SE 2020, sin salirse de los límites | FE-03, FE-10 |
| Flexbox / grid | FE-03, FE-04, FE-10 |
| Backend NestJS, lógica fuera de controllers, Hexagonal | BE-00 … BE-03 (dependency-cruiser) |
| ROP en casos de uso | BE-01, BE-07, BE-08 |
| DB sembrada con productos dummy, sin endpoint de creación | BE-02 |
| Tests unitarios con Jest > 80 % front y back, resultados en README | FE-11, BE-13, CL-06 |
| Deploy en AWS | CL-01 … CL-07 (+ BE-12 build Lambda) |
| Uso de sandbox (sin dinero real) | BE-06, CL-03 |
| Branches y PRs por feature | Convenciones en cada spec |
| Repo público sin el nombre de la compañía | Regla de nombres + CL-06 |

---

## 5. Mapeo a la rúbrica

| Rúbrica | Pts | Dónde se asegura |
|---|---|---|
| README completo | 5 | BE-13, FE-11, CL-09 (checklist abajo) |
| Imágenes rápidas y sin salirse de la UI | 5 | FE-04, FE-10 (AVIF/WebP, srcset, Lighthouse), CL-05 (cache) |
| Funcionalidad completa del onboarding | 20 | FE-04 … FE-09, BE-03 … BE-10, BE-14 |
| API funcionando correctamente | 20 | BE-*, tests e2e, smoke tests CL-07 |
| Cobertura > 80 % front y back | 30 | Umbrales 85 % en Jest, gate en CI |
| App y API desplegadas | 20 | CL-* |
| Bonus OWASP, HTTPS, headers | +5 | BE-11, CL-05, CL-09 |
| Bonus responsive y cross-browser | +5 | FE-10 |
| Bonus CSS | +10 | FE-03, FE-10 |
| Bonus clean code | +10 | Reglas de clean code en cada spec, lint estricto |
| Bonus Hexagonal | +10 | spec-backend §2–§3, dependency-cruiser |
| Bonus ROP | +10 | BE-01, casos de uso |

---

## 6. Checklist del README final

- [ ] Descripción del proyecto y links: app desplegada, Swagger público, colección Postman.
- [ ] Diagrama de arquitectura (cloud) y de capas (hexagonal).
- [ ] Modelo de datos (ER en mermaid) y máquina de estados de la transacción.
- [ ] Endpoints con ejemplos de request/response y errores.
- [ ] Cómo correr localmente (docker compose, variables, seed).
- [ ] Tarjetas de prueba de la sandbox (aprobada/rechazada).
- [ ] Resultados de cobertura de front y back (tabla con las 4 métricas).
- [ ] Decisiones (ADRs 001–007) y trade-offs.
- [ ] Seguridad: checklist OWASP + capturas de Observatory/SSL Labs.
- [ ] Responsive: capturas en 375×667 y desktop; navegadores probados.
- [ ] Uso de IA como asistente (cómo se usaron estos specs, su revisión en `CHANGELOG.md` y los planes, feature por feature).

---

## 7. Cómo usar estos specs con un asistente de IA

1. Crear la rama de la feature desde `main` (`feat/be-07-create-transaction`).
2. Dar al asistente: la sección de arquitectura del spec correspondiente + **solo** la feature a implementar + sus criterios de aceptación + la sección del plan (`docs/plans/`) de esa feature.
3. Pedir primero los tests (a partir de los criterios de aceptación) y luego la implementación.
4. Verificar DoD localmente (lint, tests, cobertura), commits pequeños, PR con la plantilla y merge cuando CI esté en verde.
