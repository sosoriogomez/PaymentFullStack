# ADR-006 · *Fingerprint* de idempotencia sin credenciales de un solo uso

- **Estado:** Aceptada
- **Fecha:** 2026-09-26
- **Feature:** BE-07, FE-09

## Contexto

El enunciado pide que la app recupere el progreso tras un refresh. El caso peligroso es un refresh justo después de tocar "Pagar":

1. El `POST /transactions` pudo llegar a la API, que creó el cobro, pero la respuesta se perdió.
2. Tras el refresh, el token de la tarjeta ya no existe (no se persiste, ADR-002), así que el cliente vuelve a escribir la tarjeta y obtiene un token **nuevo**.
3. Si la clave de idempotencia se regenerara, o si el *fingerprint* del pedido incluyera el token, la API vería un pedido distinto y **cobraría dos veces**.

## Decisión

- Cada intento de compra lleva una `Idempotency-Key` (UUID v4) que la SPA genera al llegar al resumen **solo si no existe**. Se persiste, sobrevive al refresh y a la re-captura de la tarjeta, y solo se regenera con "Intentar con otra tarjeta", cuando la transacción anterior ya terminó.
- La API guarda junto a la transacción un `request_hash`: SHA-256 del JSON canónico (claves ordenadas) de producto, cantidad, cliente, cuotas y dirección de entrega. **Excluye** el token de la tarjeta y los tokens de aceptación, porque cambian en cada captura aunque la compra sea la misma.
- Con una key ya usada:
  - mismo *fingerprint* → **200** con la transacción original y `Idempotent-Replayed: true`, sin cobrar de nuevo;
  - *fingerprint* distinto → **422**, y la SPA recupera la transacción por key.
- Dos requests simultáneas con la misma key: la segunda choca con el `UNIQUE (idempotency_key)` y responde el *replay* de la primera.
- Tras un refresh durante el pago, la SPA busca la transacción con `GET /transactions?idempotencyKey=` (con reintentos, por si el POST sigue en vuelo). Si no existe, pide la tarjeta de nuevo con la **misma** key.

## Alternativas consideradas

- **Hash del cuerpo completo:** es lo habitual, pero incluye el token de un solo uso y reabre el doble cobro descrito arriba.
- **Key nueva en cada intento:** es simple, pero un refresh durante el pago puede cobrar dos veces.
- **Deduplicar por la referencia en la pasarela:** la referencia la genera nuestra API al crear la transacción; no sirve para reconocer un reintento del cliente antes de esa creación.

## Consecuencias

- Un mismo pedido nunca se cobra dos veces, aunque el cliente refresque o reescriba la tarjeta. Está cubierto por tests de caso de uso, e2e y una carrera real contra PostgreSQL.
- Si el cliente edita el pedido (cantidad o entrega) después de usar la key, recibe 422 y la SPA recupera la transacción existente en vez de crear otra.
