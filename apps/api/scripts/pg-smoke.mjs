// Manual spike against the gateway *sandbox* (never run in CI): exercises the real adapter end to
// end and prints the raw responses, with secrets redacted, to refresh test/fixtures/pg.
//
//   npm run pg:smoke -w apps/api                 # approved sandbox card
//   npm run pg:smoke -w apps/api -- --declined   # declined sandbox card
//
// Needs apps/api/.env with the sandbox URL and test keys (see .env.example).
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { parseEnv } = require('../dist/shared/infrastructure/config/env.schema.js');
const { AppConfigService } = require('../dist/shared/infrastructure/config/app-config.service.js');
const {
  HttpPaymentGatewayAdapter,
} = require('../dist/modules/payment-gateway/infrastructure/http-payment-gateway.adapter.js');

// Public test cards documented by the sandbox: no real money is ever involved.
const SANDBOX_CARDS = { approved: '4242424242424242', declined: '4111111111111111' };
const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 2000;
const SENSITIVE_KEY = /token|signature|secret|key|authorization/i;

if (existsSync('.env')) process.loadEnvFile('.env');
const settings = new AppConfigService(
  parseEnv({ DATABASE_URL: 'postgres://unused@localhost/unused', ...process.env }),
).paymentGateway;

if (!/sandbox/.test(new URL(settings.baseUrl).hostname)) {
  throw new Error('PG_BASE_URL must point to the sandbox: this script creates real test charges');
}

const redact = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      SENSITIVE_KEY.test(key) && typeof item === 'string' ? `<redacted:${item.length}>` : item,
    ),
  );

/** Logs every raw response before the adapter maps it: the source for the fixtures. */
const loggingFetch = async (url, init) => {
  const response = await fetch(url, init);
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  const path = new URL(url).pathname.replace(settings.publicKey, '<public-key>');
  console.log(`\n${init.method} ${path} → ${response.status}`);
  console.log(JSON.stringify(redact(body), null, 2));
  return response;
};

const expectOk = (label, result) => {
  if (!result.ok) throw new Error(`${label} failed: ${JSON.stringify(result.error)}`);
  return result.value;
};

async function tokenizeCard(number) {
  const response = await loggingFetch(`${settings.baseUrl}/tokens/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.publicKey}` },
    body: JSON.stringify({
      number,
      cvc: '123',
      exp_month: '12',
      exp_year: String((new Date().getFullYear() + 2) % 100),
      card_holder: 'Prueba Sandbox',
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Card tokenization failed with ${response.status}`);
  return body.data.id;
}

async function pollUntilFinal(gateway, id) {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const transaction = expectOk('getTransaction', await gateway.getTransaction(id));
    if (transaction.status !== 'PENDING') return transaction;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Transaction ${id} still PENDING after ${POLL_ATTEMPTS} reads`);
}

async function main() {
  const gateway = new HttpPaymentGatewayAdapter(settings, { fetchFn: loggingFetch });
  const acceptance = expectOk('getAcceptanceTokens', await gateway.getAcceptanceTokens());
  const cardToken = await tokenizeCard(
    process.argv.includes('--declined') ? SANDBOX_CARDS.declined : SANDBOX_CARDS.approved,
  );
  const reference = `SMOKE-${Date.now()}`;
  const created = expectOk(
    'createCardTransaction',
    await gateway.createCardTransaction({
      reference,
      amountInCents: 1_300_000,
      currency: 'COP',
      customerEmail: 'sandbox.smoke@example.com',
      customer: { fullName: 'Prueba Sandbox', phone: '3001234567' },
      cardToken,
      installments: 1,
      acceptanceToken: acceptance.acceptanceToken,
      acceptPersonalAuth: acceptance.personalDataAuthToken,
      shipping: {
        recipientName: 'Prueba Sandbox',
        recipientPhone: '3001234567',
        addressLine1: 'Calle 1 # 2-3',
        city: 'Bogotá',
        region: 'Cundinamarca',
        country: 'CO',
        postalCode: '110111',
      },
    }),
  );
  const final = await pollUntilFinal(gateway, created.id);
  expectOk('findTransactionByReference', await gateway.findTransactionByReference(reference));
  console.log(
    `\n${reference}: ${created.status} → ${final.status} (${final.statusMessage ?? '-'})`,
  );
}

await main();
