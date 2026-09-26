# Seguridad

Cómo protege el checkout los datos de pago y personales, y dónde está cada control en el código. Cada fila apunta a la prueba que lo demuestra: nada de esta página es una promesa sin test.

## Datos sensibles

| Dato | Dónde existe | Dónde **no** existe |
|---|---|---|
| Número de tarjeta, CVC y vencimiento | Estado local del formulario (`react-hook-form`) y la llamada de tokenización del navegador a la pasarela, con la llave **pública** (ADR-002) | Redux (ni en `meta.arg` de las acciones), `localStorage`, nuestra API, la base de datos y los logs |
| Token de tarjeta | Memoria de Redux hasta que se paga; request `POST /transactions` | `localStorage`, base de datos, logs (redactado por pino) |
| Tokens de aceptación | Memoria de Redux mientras el modal está abierto | `localStorage` (se aceptan de nuevo tras un refresh) |
| Llave privada, secreto de integridad y de eventos | SSM Parameter Store (`SecureString`) → variables de la Lambda al iniciar | Código, plantillas de CloudFormation, GitHub, navegador |
| Nombre, email, teléfono, dirección | Base de datos; borrador en `localStorage` con TTL de 30 min (M-13) | Respuestas de la API: email y teléfono siempre enmascarados (`a***@mail.com`, `***4567`) |

Pruebas: `checkout.thunks.test.ts` (ninguna acción contiene PAN, CVC ni vencimiento), `persisted-state.test.ts` (el `cardToken` y los tokens de aceptación nunca llegan a `localStorage`), `typeorm-transaction.repository.int-spec.ts` (la fila de la transacción no contiene el token ni los tokens de aceptación), `logger.config.spec.ts` (redacción de rutas sensibles), `customers.e2e-spec.ts` y `deliveries.e2e-spec.ts` (datos enmascarados).

## OWASP API Security Top 10 (2023)

| Riesgo | Mitigación | Dónde | Prueba |
|---|---|---|---|
| **API1** Broken Object Level Authorization | IDs UUID v4 no enumerables; clientes y entregas se devuelven enmascarados; la búsqueda por `Idempotency-Key` exige conocer una UUID v4 que solo tiene el navegador que la creó | `uuid-param.ts`, `masking.ts`, `idempotency-key.ts` | `customers.e2e-spec.ts`, `deliveries.e2e-spec.ts`, `transactions.e2e-spec.ts` |
| **API2** Broken Authentication | Checkout de invitado sin sesiones. El webhook se autentica con el checksum SHA-256 de la pasarela, comparado en tiempo constante; en AWS solo CloudFront puede llamar a la API (`X-Origin-Verify`) | `checksum-payment-event.verifier.ts`, `constant-time.ts`, `origin-verify.guard.ts` | `payment-events.e2e-spec.ts`, `origin-verify.e2e-spec.ts` |
| **API3** Broken Object Property Level Authorization | DTOs con *whitelist* (propiedades desconocidas → 400, por ejemplo montos enviados por el cliente); las entidades ORM nunca salen de la infraestructura; los montos los calcula el servidor | `validation.ts`, `create-transaction.request.ts`, `*.response.ts` | `transactions.e2e-spec.ts` ("amounts sent by the client") |
| **API4** Unrestricted Resource Consumption | Throttling de API Gateway (global); límite por IP y ruta (60/min; 10/min para pagar); cuerpo máximo de 16 KB (32 KB solo en el webhook); `limit` máximo en listados; pool de 2 conexiones; timeouts hacia la pasarela | `rate-limit.ts`, `client-ip.ts`, `configure-app.ts`, `api-stack.ts` | `security.e2e-spec.ts`, `api-stack.test.ts` |
| **API5** Broken Function Level Authorization | No hay operaciones administrativas expuestas: los productos se siembran, no se crean por API | `products.seed.ts` | `products.e2e-spec.ts` |
| **API6** Unrestricted Access to Sensitive Business Flows | `Idempotency-Key` obligatoria: un mismo pedido nunca se cobra dos veces (replay 200, conflicto 422, carrera resuelta con `UNIQUE`); límite más estricto por IP en `POST /transactions` | `create-transaction.use-case.ts`, `typeorm-transaction.repository.ts`, `rate-limit.ts` | `create-transaction.use-case.spec.ts`, `typeorm-transaction.repository.int-spec.ts` (carrera real), `security.e2e-spec.ts` |
| **API7** Server Side Request Forgery | La URL de la pasarela es configuración fija; ninguna URL viene del usuario | `app-config.service.ts` | — |
| **API8** Security Misconfiguration | `helmet` (CSP `default-src 'none'`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS), CORS con allowlist, sin `X-Powered-By`, errores RFC 9457 sin stack; CloudFront con HTTPS y cabeceras de seguridad propias para la SPA | `configure-app.ts`, `problem-details.filter.ts`, `security-headers-policy.ts` | `security.e2e-spec.ts`, `problem-details.e2e-spec.ts`, `web-stack.test.ts` |
| **API9** Improper Inventory Management | Versionado `/api/v1`; documentación OpenAPI publicada | `configure-app.ts` | `health.e2e-spec.ts` |
| **API10** Unsafe Consumption of APIs | Las respuestas de la pasarela se validan con zod antes de usarse; timeouts y *deadline*; un cobro nunca se reintenta; el monto, la moneda y la referencia que reporta la pasarela deben coincidir con los nuestros (I-06) | `gateway.schemas.ts`, `http-payment-gateway.adapter.ts`, `finalize-transaction.use-case.ts` | `http-payment-gateway.adapter.spec.ts`, `finalize-transaction.use-case.spec.ts` |

## Cabeceras

**API** (`helmet`, en cada respuesta, también en errores):

```
Content-Security-Policy: default-src 'none';frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-origin
Cache-Control: no-store
```

**SPA** (política de cabeceras de CloudFront): CSP con `default-src 'self'`, `connect-src` limitado a la propia origen y a la pasarela (tokenización), `frame-ancestors 'none'`, `object-src 'none'`, HSTS de dos años **sin** `preload` (I-12: `*.cloudfront.net` no es un dominio propio), `nosniff` y `DENY`. Sin `dangerouslySetInnerHTML`, sin Redux DevTools en producción y sin *source maps* publicados.

## Límite por IP detrás de CloudFront (I-01, I-21)

Detrás de CloudFront → API Gateway, la IP del socket es la de un *edge*. La API toma la del cliente del encabezado `CloudFront-Viewer-Address`, que CloudFront escribe y reenvía con una política de *origin request* propia (la política administrada `AllViewerExceptHostHeader` no incluye encabezados de CloudFront). El encabezado solo se usa en AWS, donde la API únicamente acepta tráfico que viene de CloudFront. En local se usa `req.ip`, porque ahí cualquiera podría falsificarlo.

Limitación conocida: los contadores viven en la memoria de cada instancia de Lambda, así que el límite es *best-effort*. El límite global lo pone el throttling de API Gateway. Una regla *rate-based* de AWS WAF sería la mejora siguiente (tiene costo).

## Secretos

- Llaves de la pasarela: SSM `SecureString` bajo `/checkout/prod/*`, cargadas con `put-parameters.sh` y leídas por las Lambdas al iniciar. La política IAM limita la lectura a ese prefijo.
- Credenciales de la base de datos: Secrets Manager (generadas por RDS).
- `X-Origin-Verify`: Secrets Manager, generado por CDK; CloudFront lo resuelve como *dynamic reference* (C-06).
- CI/CD: OIDC con GitHub, sin llaves de AWS de larga duración. En CI una verificación busca patrones de llaves y el nombre de la compañía antes de cualquier otro paso.

## Dependencias

`npm audit --omit=dev --audit-level=high` corre en CI en cada push (job `audit`). Dependabot abre PRs semanales.
