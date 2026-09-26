import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const DOCS_PATH = 'api/docs';

const DESCRIPTION = `
Checkout of a product paid by card through a payment gateway (sandbox: no real money).

**Flow:** \`GET /products\` → \`GET /checkout/acceptance\` → tokenize the card in the browser
with the gateway's public key → \`POST /customers\` → \`GET /checkout/quote\` →
\`POST /transactions\` (with \`Idempotency-Key\`) → poll \`GET /transactions/{id}\` until a final
status → \`GET /deliveries/{id}\`.

Errors are \`application/problem+json\` (RFC 9457): branch on \`code\`.`;

/** OpenAPI at /api/docs (UI) and /api/docs-json, generated from the controllers and DTOs. */
export function setupOpenApi(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Checkout API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addTag('products', 'Catalog and stock (seeded; never created through the API)')
    .addTag('checkout', 'Price quote and the gateway terms to accept')
    .addTag('customers', 'Guest customers (upsert by email, masked answers)')
    .addTag('transactions', 'Payments: create once per Idempotency-Key, then poll the status')
    .addTag('deliveries', 'Deliveries of approved transactions')
    .addTag('payment-events', 'Webhook of the payment gateway (checksum-authenticated)')
    .addTag('health', 'Liveness and database ping')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: `${DOCS_PATH}-json`,
    customSiteTitle: 'Checkout API',
    // The online validator badge is an external image: the docs CSP blocks it on purpose.
    swaggerOptions: { validatorUrl: null },
  });
}
