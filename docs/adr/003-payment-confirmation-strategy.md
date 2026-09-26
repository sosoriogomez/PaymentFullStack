# ADR-003 · Estrategia de confirmación del pago

- **Estado:** Aceptada
- **Fecha:** 2026-09-26
- **Feature:** BE-08, BE-10 (BE-14 en ADR-007)

## Contexto

Al crear el cobro, la pasarela casi siempre responde `PENDING`: el resultado final (APPROVED, DECLINED, VOIDED o ERROR) llega segundos después. El enunciado pide mostrarlo en la pantalla 4 y, al terminar, actualizar la transacción, asignar la entrega y descontar el stock.

La pasarela ofrece dos formas de conocer el resultado: consultar `GET /transactions/{id}` o recibir un evento en una URL registrada en el panel del comercio. La cuenta de sandbox de la prueba es compartida y no debe modificarse, así que no se puede registrar la URL de nuestros eventos.

## Decisión

1. **Polling del cliente con sincronización en el servidor.** La SPA consulta `GET /api/v1/transactions/:id` a los 2, 2, 3, 3 y 5 segundos, hasta 90 s, y se pausa cuando la pestaña está oculta. Si la transacción sigue PENDING, la API consulta a la pasarela (por id y, si no lo tiene, por referencia) y, si ya es final, la finaliza (`SyncTransactionStatus` → `FinalizeTransaction`).
2. **Reconciliación programada** cada 5 minutos para las PENDING que nadie consultó: el cliente cerró la pestaña o perdió la conexión (ADR-007).
3. **Webhook `POST /api/v1/payment-events`** como complemento: verifica el checksum SHA-256 con el secreto de eventos, en tiempo constante, y usa el mismo `FinalizeTransaction`. Queda listo por si la URL se registra en otra cuenta.

Los tres caminos terminan en la misma guarda `UPDATE … WHERE status = 'PENDING'`, así que pueden correr a la vez sin duplicar el stock ni la entrega (ADR-001).

## Alternativas consideradas

- **Solo webhook:** es lo más eficiente, pero no se puede registrar en la cuenta compartida. Además, sin un respaldo, un evento perdido deja la transacción PENDING para siempre.
- **Solo polling del cliente:** si el cliente se va, una transacción aprobada nunca se finaliza. Por eso existe la reconciliación.
- **Esperar el resultado dentro de `POST /transactions`:** alarga la request con un bucle de consultas dentro de la Lambda (timeout de 20 s) y no resuelve el caso en que el resultado tarda más.

## Consecuencias

- El resultado aparece en pocos segundos mientras el cliente mira la pantalla, y ninguna transacción depende de que el cliente se quede.
- `GET /transactions/:id` puede escribir en la base (finaliza), pero sigue siendo idempotente para el cliente: repetirlo no cambia el resultado.
- Tras 90 s sin resultado, la SPA muestra "Tu pago sigue en proceso" con un botón para consultar de nuevo.
