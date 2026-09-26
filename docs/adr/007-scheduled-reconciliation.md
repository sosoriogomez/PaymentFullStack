# ADR-007 · Reconciliación programada de transacciones PENDING

- **Estado:** Aceptada
- **Fecha:** 2026-09-26
- **Feature:** BE-14 (infraestructura en CL-04)

## Contexto

El polling del cliente finaliza las transacciones mientras la pantalla de estado está abierta (ADR-003), y el webhook no se puede registrar en la cuenta compartida de la sandbox. Si el cliente cierra la pestaña justo después de pagar, un pago **aprobado** quedaría PENDING: sin entrega y sin descontar el stock, justo lo que el enunciado pide hacer al terminar el pago.

## Decisión

Una Lambda `reconcile`, invocada por **EventBridge Scheduler** cada 5 minutos, ejecuta `ReconcilePendingTransactions`:

1. Toma hasta 25 transacciones PENDING con más de 1 minuto de antigüedad; las más recientes quedan para el polling.
2. Sincroniza cada una por el mismo camino que el polling (`SyncTransactionStatus`), así que es idempotente con él y con el webhook.
3. Si la pasarela no tiene registro de una transacción con más de 15 minutos (el cobro nunca llegó a crearse), la marca `ERROR` con el motivo `EXPIRED_WITHOUT_GATEWAY_RECORD`.
4. Procesa en serie, porque el pool de conexiones es de 2. Un fallo no detiene el lote: se registra (`RECONCILIATION_FAILED`) y se reintenta en la siguiente corrida.

El schedule no reintenta (`retryAttempts: 0`) y descarta invocaciones de más de 4 minutos, porque la siguiente corrida ya cubre lo pendiente.

## Alternativas consideradas

- **Cron en la Lambda de la API o `setInterval`:** una Lambda no corre si nadie la invoca.
- **Regla programada de EventBridge (cron clásico):** también sirve; Scheduler tiene un L2 en CDK, reintentos y edad máxima configurables, y un rol dedicado que solo puede invocar esa función.
- **Cola con reintentos (SQS) por transacción:** más piezas para el mismo resultado con este volumen.

## Consecuencias

- Ninguna transacción depende de que el cliente se quede en la página: en el peor caso se finaliza a los 5 minutos.
- Las transacciones que nunca llegaron a la pasarela no quedan PENDING para siempre.
- Costo prácticamente nulo: 8.640 invocaciones cortas al mes.
