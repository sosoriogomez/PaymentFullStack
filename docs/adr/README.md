# Architecture Decision Records

Cada ADR registra una decisión con su contexto, las alternativas y las consecuencias. Formato: `NNN-titulo-en-kebab-case.md` con las secciones *Estado*, *Contexto*, *Decisión*, *Alternativas consideradas* y *Consecuencias*. El índice se completa durante la implementación, en la feature indicada.

| ADR | Decisión | Estado | Se redacta en |
|---|---|---|---|
| 001 | El stock se descuenta al aprobar, con un decremento atómico condicional; no se reserva al crear | Aceptada | BE-08 |
| 002 | La tarjeta se tokeniza en el cliente con la llave pública; el PAN nunca toca nuestra API | Aceptada (sujeta al spike de CORS, I-20) | FE-02 |
| 003 | Confirmación del pago: polling del cliente con sincronización server-side + reconciliación programada; webhook como complemento | Aceptada | BE-08 / BE-10 |
| 004 | Lambda + RDS privada con NAT instance y CloudFront como único origen | Aceptada | CL-04 |
| 005 | Build de Lambda en dos pasos (tsc → esbuild), porque esbuild no emite `emitDecoratorMetadata` | Aceptada | BE-12 |
| 006 | *Fingerprint* de idempotencia sin credenciales de un solo uso; la `Idempotency-Key` sobrevive a la re-captura de tarjeta | Aceptada | BE-07 / FE-09 |
| 007 | Reconciliación programada de transacciones PENDING con EventBridge Scheduler cada 5 min | Aceptada | BE-14 |

Las motivaciones de 005–007 están en [`../specs/CHANGELOG.md`](../specs/CHANGELOG.md) (C-01, C-04 y C-03).
