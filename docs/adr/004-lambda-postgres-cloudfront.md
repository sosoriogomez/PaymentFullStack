# ADR-004 · Lambda + RDS privada con NAT instance y CloudFront como único origen

- **Estado:** Aceptada
- **Fecha:** 2026-09-26
- **Features:** CL-01 … CL-05

## Contexto

Hay que publicar la SPA y la API en AWS por HTTPS, con un solo link entregable, headers de seguridad y un costo cercano a cero durante la evaluación. La API necesita PostgreSQL (transacciones ACID para el stock y el estado del pago) y salida a internet para llamar a la pasarela.

## Decisión

| Pieza | Elección | Motivo |
|---|---|---|
| Entrada | CloudFront: `/*` → S3 (OAC) y `/api/*` → API Gateway HTTP API | Mismo origen (sin CORS), una sola política de headers, un único link |
| Cómputo | Lambda Node 24 arm64 detrás de un HTTP API (payload v2) | Sin costo fijo, HTTPS gestionado, escala a cero |
| Datos | RDS PostgreSQL 16 `db.t4g.micro` en subnets aisladas, `rds.force_ssl=1` | Nunca expuesta a internet; TLS verificado con el bundle CA de RDS |
| Salida a internet | NAT **instance** `t4g.nano` en lugar de NAT Gateway | ~USD 3/mes en vez de ~USD 32/mes |
| Acceso directo a la API | Header secreto `X-Origin-Verify` generado en Secrets Manager (C-06) | Las llamadas a `execute-api` que se saltan CloudFront reciben 403 |
| Fallback de la SPA | CloudFront Function solo en el behavior por defecto | `customErrorResponses` convertiría los 404/403 de la API en `index.html` |
| Protección de la RDS | Throttling del HTTP API (25 rps, burst 50) + pool `max: 2`; reserved concurrency opcional (C-02) | Sin RDS Proxy (costo) y sin romper el deploy en cuentas nuevas |

## Alternativas consideradas

- **DynamoDB sin VPC:** evita NAT y VPC, pero la regla de negocio (decremento atómico de stock + estado del pago + entrega en una sola unidad de trabajo) es más natural con transacciones SQL.
- **ECS Fargate + ALB:** costo fijo mensual y más piezas que operar para el volumen de la prueba.
- **RDS pública con TLS:** descartada por seguridad.

## Consecuencias

- La NAT instance es un punto único de falla aceptable para la evaluación; hay alarma de `StatusCheckFailed` (CL-08).
- Los cold starts (Nest + TypeORM + VPC) rondan 1–3 s; la app se crea una vez por contenedor.
- `cdk destroy --all` elimina todo salvo el snapshot final de RDS y el bucket web (`RETAIN`), que se borran a mano.
