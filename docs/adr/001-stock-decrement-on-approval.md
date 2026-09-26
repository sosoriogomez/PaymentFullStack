# ADR-001 · El stock se descuenta al aprobar, con un decremento atómico

- **Estado:** Aceptada
- **Fecha:** 2026-09-26
- **Feature:** BE-08

## Contexto

El enunciado pide actualizar el stock y asignar la entrega cuando el pago termina. Entre que el cliente abre el checkout y la pasarela aprueba pasan segundos o minutos, y otro cliente puede estar comprando las mismas unidades. Además, el resultado puede llegar por tres caminos a la vez: el polling del cliente, la reconciliación y el webhook.

## Decisión

El stock se descuenta **solo cuando la transacción queda APPROVED**, dentro de la misma transacción de base de datos que la finaliza (`FinalizeTransaction`):

1. `UPDATE transactions … WHERE status = 'PENDING'`: solo un camino gana; los demás ven la transacción ya final y no hacen nada.
2. `UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q`: el decremento es atómico y nunca deja el stock negativo (además hay un `CHECK (stock >= 0)`).
3. Si el decremento afecta una fila, la entrega queda `ASSIGNED`. Si no (otra compra se llevó las últimas unidades), queda `BACKORDERED` y se registra en el log para gestionarla a mano. El pago sigue aprobado, porque la pasarela ya cobró.

Antes de crear la transacción, `GET /checkout/quote` y `POST /transactions` rechazan con 409 una cantidad mayor que el stock disponible en ese momento.

## Alternativas consideradas

- **Reservar el stock al crear la transacción:** evita vender de más, pero las reservas de pagos abandonados o rechazados hay que liberarlas (otro job, otro estado) y mientras tanto el catálogo muestra menos unidades de las reales. Demasiada maquinaria para un producto con stock sembrado.
- **Descontar al crear y compensar si falla:** cada rechazo, error o expiración necesita una compensación, y una compensación perdida deja el stock mal para siempre.
- **`SELECT … FOR UPDATE` del producto:** también es correcto, pero bloquea la fila durante toda la finalización; el `UPDATE` condicional logra lo mismo en una sola sentencia.

## Consecuencias

- El stock nunca queda negativo y un pago nunca descuenta dos veces. Hay tests de integración contra PostgreSQL con dos finalizaciones concurrentes.
- En el caso raro de dos pagos aprobados por la última unidad, uno queda `BACKORDERED`: la app lo muestra ("te contactaremos para coordinar la entrega") en vez de ocultarlo.
- Las unidades que ve el cliente en el catálogo son las disponibles en ese momento, no una promesa.
