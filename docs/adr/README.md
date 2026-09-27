# Architecture Decision Records

Cada ADR registra una decisión con su contexto, las alternativas y las consecuencias. Formato: `NNN-titulo-en-kebab-case.md` con las secciones *Estado*, *Contexto*, *Decisión*, *Alternativas consideradas* y *Consecuencias*.

| ADR | Decisión | Estado |
|---|---|---|
| [001](001-stock-decrement-on-approval.md) | El stock se descuenta al aprobar, con un decremento atómico condicional; no se reserva al crear | Aceptada |
| [002](002-client-side-tokenization.md) | La tarjeta se tokeniza en el cliente con la llave pública; el PAN nunca toca nuestra API | Aceptada; CORS confirmado en producción (I-20) |
| [003](003-payment-confirmation-strategy.md) | Confirmación del pago: polling del cliente con sincronización en el servidor + reconciliación programada; webhook como complemento | Aceptada |
| [004](004-lambda-postgres-cloudfront.md) | Lambda + RDS privada con NAT instance y CloudFront como único origen | Aceptada |
| [005](005-lambda-build-tsc-esbuild.md) | Build de Lambda en dos pasos (tsc → esbuild), porque esbuild no emite `emitDecoratorMetadata` | Aceptada |
| [006](006-idempotency-fingerprint.md) | *Fingerprint* de idempotencia sin credenciales de un solo uso; la `Idempotency-Key` sobrevive a la re-captura de tarjeta | Aceptada |
| [007](007-scheduled-reconciliation.md) | Reconciliación programada de transacciones PENDING con EventBridge Scheduler cada 5 min | Aceptada |

Las motivaciones de 005–007 están en [`../specs/CHANGELOG.md`](../specs/CHANGELOG.md) (C-01, C-04 y C-03).
