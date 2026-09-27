# ADR-002 · Tokenización de la tarjeta en el cliente

- **Estado:** Aceptada. CORS confirmado en producción (ver *Verificación*)
- **Fecha:** 2026-09-26
- **Feature:** FE-02

## Contexto

El checkout necesita cobrar con tarjeta a través de la pasarela. Si el número de tarjeta (PAN), el CVC y la fecha de expiración pasan por nuestra API, esta entra en el alcance de PCI DSS: cualquier log, dump de memoria o error podría exponerlos.

La pasarela ofrece `POST /tokens/cards`, autenticado con la **llave pública** del comercio, que devuelve un token de un solo uso. El cobro (`POST /transactions`) solo necesita ese token.

## Decisión

El navegador tokeniza la tarjeta directamente contra la pasarela con la llave pública (`GatewayCardTokenizer`, adaptador del puerto `CardTokenizer`). Nuestra API solo recibe el token, y crea el cobro con la llave privada, que nunca sale del servidor.

- El PAN, el CVC y la expiración viven solo en el estado local del formulario (`react-hook-form`) y en la llamada de tokenización. Nunca llegan a Redux, al storage, a los logs ni a nuestra API.
- A Redux solo llegan `brand`, `lastFour`, el nombre del titular y el token. El token está excluido de la persistencia.
- La CSP permite `connect-src` hacia el host de la pasarela (que viene de una variable de despliegue, no del código).

## Alternativas consideradas

- **Enviar la tarjeta a nuestra API y tokenizar en el servidor:** simplifica CORS, pero mete a la API en el alcance PCI. Se descarta como camino principal.
- **Widget embebido de la pasarela:** reduce el control sobre la UX que exige la prueba (modal propio con validaciones y logos). Se descarta.

## Consecuencias

- Menor superficie de ataque y de cumplimiento: la API nunca ve datos de tarjeta.
- Dependemos de que la pasarela acepte peticiones CORS desde nuestro origen.

## Verificación (I-20)

El entorno donde se escribió esta decisión no tenía salida de red hacia la sandbox, así que **CORS no se pudo comprobar**. Antes de publicar:

1. Con `npm run dev -w apps/web` y un `.env` local con la URL y la llave pública de la sandbox, abrir el modal de pago y tokenizar `4242 4242 4242 4242`.
2. Si el navegador bloquea la petición por CORS, activar el **plan B** sin tocar el dominio ni los componentes: un endpoint `POST /api/v1/card-tokens` en la API que reenvía el cuerpo a la pasarela, no lo persiste ni lo loguea (redact) y no toca la base de datos; en el front solo cambia el adaptador de `CardTokenizer`.

**Resultado (2026-09-27, sobre producción).** La tokenización desde el navegador funciona y el plan B no hace falta:

- **Preflight:** un `OPTIONS /v1/tokens/cards` con el origen de CloudFront responde 200 con `access-control-allow-origin: *`, los métodos permitidos incluyen `POST` y las cabeceras permitidas incluyen `Authorization` y `Content-Type`.
- **CSP:** la política de la SPA permite ese host en `connect-src`.
- **Compras:** una aprobada (`4242 4242 4242 4242`) y una rechazada (`4111 1111 1111 1111`) se tokenizaron desde el navegador y terminaron en su estado final.
