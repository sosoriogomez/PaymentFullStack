# Registro de correcciones de los specs

Revisión de los specs v1.0 contra el enunciado de la prueba, la documentación pública de la pasarela y las restricciones reales de AWS. Resultado: **v1.1**. El diff exacto de cada cambio está en el commit que acompaña este archivo.

**Veredicto:** los specs v1.0 son sólidos. Cubren todos los requisitos del enunciado y todos los ítems de la rúbrica, y la trazabilidad del overview (§4 y §5) es correcta. Tenían, eso sí, 6 errores que habrían roto el despliegue o la funcionalidad (C-xx), 20 ajustes importantes de corrección técnica o robustez (I-xx) y 13 detalles de consistencia (M-xx).

Severidad:

- **C (crítica):** rompe el deploy, pierde dinero o datos, o deja el flujo sin terminar.
- **I (importante):** error técnico o de robustez que un evaluador puede notar.
- **M (menor):** consistencia entre documentos o detalle.

---

## Críticas

| ID | Dónde | Problema | Corrección | Motivo |
|---|---|---|---|---|
| C-01 | BE §1, BE-12, CL §2, CL-04 | El bundle con esbuild (directo o vía `NodejsFunction`) **no emite `emitDecoratorMetadata`**. Sin `design:paramtypes`, la inyección por tipo de NestJS, `@ValidateNested/@Type` y el plugin de Swagger fallan en Lambda aunque todo funcione en local | Build en dos pasos: `nest build` (tsc) → esbuild sobre el JS compilado (`scripts/bundle-lambda.mjs`) → CDK `lambda.Function` + `Code.fromAsset('apps/api/dist-lambda')`. ADR-005 | Limitación documentada de esbuild y de `aws-lambda-nodejs` (issue aws-cdk#13767) |
| C-02 | CL §1, CL-04 | `reservedConcurrentExecutions: 10` **hace fallar el deploy** en cuentas nuevas: la cuota de concurrencia arranca en 10 y AWS exige dejar al menos 10 sin reservar | Reserved concurrency opcional por stage (default: no se reserva). La RDS se protege con el throttling de API Gateway y un pool `max: 2` | Cuotas por defecto de Lambda en cuentas nuevas |
| C-03 | BE §5.3–5.4, ADR-003 | La confirmación dependía del polling del cliente y el webhook no se puede registrar (sandbox compartida). Si el usuario cierra la pestaña, una transacción **aprobada** queda PENDING para siempre: sin entrega ni descuento de stock | Nueva **BE-14**: `ReconcilePendingTransactions` en una Lambda invocada por **EventBridge Scheduler** cada 5 min. Las PENDING sin registro en la pasarela tras 15 min pasan a ERROR `EXPIRED_WITHOUT_GATEWAY_RECORD`. Nuevo §5.5 en backend y ADR-007 | Requisito 5.3 del enunciado: "una vez completado o fallido el pago, actualizar transacción, asignar entrega y actualizar stock" |
| C-04 | FE §2.4, FE-06, FE-09, BE §5.2 | **Ventana de doble cobro:** tras un refresh durante el POST, `GET ?idempotencyKey` puede dar 404 mientras el POST sigue en vuelo; el front generaba una key nueva y cobraba otra vez. Además, la fila "PROCESSING sin id → SUMMARY" era imposible, porque el `cardToken` no se persiste | El *fingerprint* de idempotencia **excluye credenciales de un solo uso** (`cardToken`, `acceptanceToken`, `acceptPersonalAuth`). El front conserva la misma key al re-capturar la tarjeta y solo la regenera en `retryWithAnotherCard()` o `checkoutReset()`. La recuperación reintenta el lookup 3 veces y vuelve a PAYMENT_FORM. ADR-006 | Evitar doble cobro es el riesgo de negocio número uno de un checkout (OWASP API6) |
| C-05 | BE §4.1, BE-02 | El driver `pg` devuelve las columnas `bigint` como **string**; `product + fee` concatenaría textos en lugar de sumar | `ValueTransformer` bigint⇄number con guarda `Number.isSafeInteger` en todas las columnas `*_in_cents`, con test | Comportamiento por defecto de `node-postgres` |
| C-06 | CL-03 vs CL-07 | El secreto `X-Origin-Verify` estaba definido dos veces y de forma contradictoria: en SSM (CL-03) y como contexto de CDK desde GitHub Secrets (CL-07). Por contexto queda en texto plano en la plantilla de CloudFormation | CDK genera un `secretsmanager.Secret`; CloudFront lo referencia (dynamic reference) y la Lambda lo lee al iniciar. Se elimina de SSM y de GitHub Secrets | Una sola fuente de verdad; nada secreto en plantillas ni en CI |

## Importantes

| ID | Dónde | Corrección |
|---|---|---|
| I-01 | BE-07, BE-11 | Detrás de CloudFront → API Gateway, `req.ip` es la IP del edge y el throttler en memoria es por instancia. El tracker usa el header `CloudFront-Viewer-Address`. Se documenta como *best-effort* y se propone una regla rate-based de WAF como mejora opcional |
| I-02 | BE §6.3, BE-06 | Presupuesto de tiempo: 8 s × 3 intentos + backoff superaba el timeout de la Lambda (20 s). POST: 8 s sin reintentos. GET: 4 s por intento, máx. 2 reintentos, deadline total de 12 s |
| I-03 | BE §2.3 | `GATEWAY_REJECTED` no tenía mapeo HTTP → **502**. `GATEWAY_UNAVAILABLE` → 503 + `Retry-After`. El mapper es exhaustivo (`assertNever`) |
| I-04 | BE §2.3, §5 | RFC 7807 fue reemplazado por **RFC 9457**. `type` con dominio `.local` no resuelve → `about:blank` + miembro de extensión `code` |
| I-05 | BE §5.2, BE-07 | El replay idempotente responde **200** (no se creó recurso) + `Idempotent-Replayed: true` + `Location`. Las requests concurrentes con la misma key se resuelven capturando la violación de `UNIQUE` |
| I-06 | BE §4.3, BE-08, BE-10 | Invariante al finalizar: `reference`, monto y moneda de la pasarela deben coincidir con la transacción. Si no → ERROR `AMOUNT_MISMATCH`, sin entrega ni cambio de stock |
| I-07 | BE §5, BE-03, FE §4 | El enunciado nombra el recurso **stock**: se añade `GET /api/v1/products/:id/stock`, que usa el paso 5 |
| I-08 | Todos | Node 22 → **Node 24 LTS** (`nodejs24.x`, soporte hasta abr-2028; Node 22 termina en abr-2027). Solo handlers async |
| I-09 | BE §6.3, FE §4, CL-03 | El enunciado da dos URLs UAT; se usa **la de sandbox** (host con prefijo `api-sandbox`), coherente con las llaves `stagtest` y con la obligación de operar en sandbox |
| I-10 | FE §2.4, FE-08 | `/transactions/:id` funciona por deep link sin estado persistido: carga la transacción por id |
| I-11 | FE §1, FE-05 | `simple-icons` exporta datos (`path`, `hex`), no componentes; `CardBrandLogo` construye el `<svg>` accesible |
| I-12 | CL-05 | HSTS `preload` no aplica sobre `*.cloudfront.net`; se añade solo con dominio propio |
| I-13 | FE §1, FE-00 | React Router 7 en jsdom necesita el polyfill `TextEncoder/TextDecoder` en `setupFiles` |
| I-14 | BE-12 | Swagger UI lee sus assets del disco: `swagger-ui-dist` se marca *external* y se copia al bundle |
| I-15 | BE §1, BE-02, BE-12 | Dentro de un bundle no hay globs: entidades y migraciones de TypeORM como arrays de clases; drivers no usados y `pg-native` como externals |
| I-16 | BE-02, CL-07 | `cdk deploy` publica el código antes de correr `migrate`, así que las migraciones deben ser **expand/contract** (retrocompatibles) |
| I-17 | CL §3, CL-07 | Para usar OIDC, el rol de GitHub debe poder asumir los roles `cdk-*` del bootstrap: `GithubOidcStack`, desplegado una vez a mano |
| I-18 | FE §2.2, FE-06, FE-07 | El token de tarjeta expira: se guarda `cardTokenExpiresAt`; si venció al pagar, se pide re-captura |
| I-19 | BE §6.3, BE-06 | Formato de teléfonos: `shipping_address.phone_number` nacional (10 dígitos) y `customer_data.phone_number` con indicativo `57`; se confirma en el spike de BE-06 |
| I-20 | FE-02 | No se pudo verificar que la sandbox permita CORS en `/tokens/cards` desde el navegador. Se agrega un **spike** al inicio de FE-02 y un plan B (proxy en el backend que no persiste ni loguea) que no cambia el puerto `CardTokenizer` |
| I-21 | CL-05, BE-11 | Detectado al implementar: la política administrada `AllViewerExceptHostHeader` no reenvía encabezados de CloudFront, así que `CloudFront-Viewer-Address` no llegaba a la API y el límite por IP habría contado por *edge location*. Se reemplaza por una política propia con allowlist (encabezados que la API lee + `CloudFront-Viewer-Address`, sin `Host`) |
| I-22 | CL-07 | Detectado al revisar el primer deploy: con `environment: production` en el job, GitHub firma el token OIDC con `sub = repo:<owner>/<repo>:environment:production`, y el rol solo confía en `ref:refs/heads/main`, así que el deploy habría fallado al asumirlo. Se quita el `environment` del job y el stack OIDC imprime el ARN del rol como output |

## Menores

| ID | Dónde | Corrección |
|---|---|---|
| M-01 | FE §2.5 | `shared/i18n/es.ts` se citaba en §2.6 pero faltaba en el árbol de carpetas |
| M-02 | BE-11, CL-09, overview | `docs/security.md` vs `docs/security/` → se unifica en `docs/security/README.md` + capturas |
| M-03 | BE §4.1, FE-04 | `image_url` no encajaba con las variantes AVIF/WebP/JPG del front → columna `image_key` (slug) + convención `/images/products/{key}-{w}.{fmt}` |
| M-04 | BE-00, BE §8 | Projects de Jest `unit`/`integration`/`e2e`; `test:unit` sin Docker; el gate de CI mide la corrida combinada y el README reporta ambas |
| M-05 | Overview, BE §5.4 | ADR-003 renombrado a "estrategia de confirmación": polling del cliente con sync server-side + reconciliación + webhook complementario |
| M-06 | Overview, BE §10 | Nuevos ADR-005 (build de Lambda), ADR-006 (fingerprint de idempotencia) y ADR-007 (reconciliación) |
| M-07 | BE §5.2 | Validaciones explícitas: `country ∈ {'CO'}`, moneda COP, teléfono y código postal del destinatario |
| M-08 | CL-00 | Lista de supresiones esperadas de `cdk-nag`, cada una con su justificación |
| M-09 | Todos | Convención de ramas: `feat/<area>-<nn>-<slug>` desde `main` y PR hacia `main` |
| M-10 | BE §2.3 | Mapper de errores exhaustivo (tabla con *mapped type* por código): un código nuevo sin mapear rompe el typecheck |
| M-11 | BE §5.3 | Se aclara por qué el GET con sincronización sigue siendo seguro e idempotente para el cliente |
| M-12 | BE §5 | Trade-off documentado del upsert de customers por email (checkout de invitado, respuestas enmascaradas) |
| M-13 | FE §2.3 | Trade-off documentado de persistir borradores con datos personales (TTL de 30 min y borrado al terminar) |

---

## Alcance (v1.2)

Criterio: se conserva todo lo que mejora la app que pide el enunciado (robustez del pago, seguridad, rendimiento, pruebas) y se retira lo que agrega una sección nueva que el enunciado no pide.

| ID | Dónde | Cambio | Motivo |
|---|---|---|---|
| S-01 | CL-08, CL-07, overview | Se retira `MonitoringStack`: alarmas de CloudWatch, tópico SNS, presupuesto de AWS Budgets y dashboard, junto con la variable `ALARM_EMAIL`. Los costos estimados pasan a CL-09 | Es una funcionalidad nueva de operación; el enunciado pide publicar la app, no monitorearla. Los logs de CloudWatch se mantienen |
| S-02 | FE-10, CL-06 | Lighthouse deja de ser un job de CI (que además necesitaba un servidor de datos simulados) y pasa a ser una medición manual con los resultados en el README | Da la misma evidencia para "imágenes que cargan rápido" sin agregar infraestructura de CI |
| S-03 | CL-06 | Se retira Dependabot (`dependabot.yml`). La revisión de dependencias queda en `npm audit` dentro del CI | Sus PRs automáticos (varios saltos de versión mayor sin probar) no aportan a la entrega y ensucian el historial de PRs |
| S-04 | CL-06 | Se retira la verificación de palabras prohibidas del CI y su secreto `FORBIDDEN_WORDS`. La regla de nombres se mantiene y se revisa en la checklist de cada PR; la guarda de patrones de llaves sigue en CI | Decisión del autor: no mantener un secreto solo para esa verificación |

---

## Verificaciones externas realizadas

- La creación de transacciones usa la **llave privada** y exige `acceptance_token` + `accept_personal_auth` (política de privacidad y tratamiento de datos personales), como estaba en el spec.
- esbuild no soporta `emitDecoratorMetadata` (confirma C-01).
- Lambda ofrece `nodejs24.x` y CDK expone `Runtime.NODEJS_24_X` (confirma I-08).
- **Pendiente de verificar en los spikes** (el entorno de revisión no tenía salida a la sandbox): CORS de `/tokens/cards` (I-20), forma exacta de las respuestas y formato de teléfonos (I-19).
