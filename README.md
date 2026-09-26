# Checkout Onboarding

Checkout de un producto pagado con tarjeta de crédito a través de una **Payment Gateway (PG)** en modo sandbox: SPA mobile-first en React + Redux Toolkit y API NestJS con arquitectura hexagonal y Railway Oriented Programming, desplegadas en AWS.

> **Estado:** fase de diseño. Los specs corregidos y los planes de implementación están listos; la implementación avanza feature por feature (una rama y un PR por feature hacia `main`).

## Flujo de negocio (5 pantallas)

```
1. Producto → 2. Tarjeta / Entrega (modal) → 3. Resumen (Backdrop) → 4. Estado final → 5. Producto (stock actualizado)
```

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/specs/00-overview.md`](docs/specs/00-overview.md) | Visión general, stack, hoja de ruta, trazabilidad requisito → feature y rúbrica |
| [`docs/specs/spec-backend.md`](docs/specs/spec-backend.md) | API: hexagonal + ROP, modelo de datos, contrato, integración con la pasarela |
| [`docs/specs/spec-frontend.md`](docs/specs/spec-frontend.md) | SPA: Flux con Redux Toolkit, UX de 5 pasos, resiliencia tras refresh |
| [`docs/specs/spec-cloud.md`](docs/specs/spec-cloud.md) | AWS con CDK, CI/CD con OIDC, headers de seguridad |
| [`docs/specs/CHANGELOG.md`](docs/specs/CHANGELOG.md) | Correcciones aplicadas a los specs (v1.0 → v1.1) y su motivo |
| [`docs/plans/plan-backend.md`](docs/plans/plan-backend.md) | Plan de implementación del backend |
| [`docs/plans/plan-frontend.md`](docs/plans/plan-frontend.md) | Plan de implementación del frontend |
| [`docs/plans/plan-cloud.md`](docs/plans/plan-cloud.md) | Plan de implementación de la infraestructura y CI/CD |
| [`docs/adr/README.md`](docs/adr/README.md) | Índice de decisiones de arquitectura (ADR) |

## Stack

| Capa | Tecnologías |
|---|---|
| Frontend | React 19, TypeScript, Vite, Redux Toolkit (Flux), React Router, react-hook-form + zod, CSS Modules |
| Backend | Node.js 24, TypeScript, NestJS 11, Hexagonal (Ports & Adapters), ROP, TypeORM, PostgreSQL 16 |
| Tests | Jest (front, back e infra), React Testing Library, supertest, Testcontainers |
| Cloud | AWS CDK: CloudFront, S3, API Gateway HTTP API, Lambda, RDS PostgreSQL, EventBridge Scheduler |
| CI/CD | GitHub Actions con OIDC |

## Próximas secciones (se completan durante la implementación)

- Links: app desplegada, Swagger público y colección Postman.
- Cómo correr localmente, variables de entorno y datos de prueba de la sandbox.
- Modelo de datos, arquitectura y resultados de cobertura.
