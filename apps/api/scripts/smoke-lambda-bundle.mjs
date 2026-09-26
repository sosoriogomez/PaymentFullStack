// Loads every bundled handler: fails when esbuild broke module resolution or decorator metadata.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
for (const name of ['lambda', 'migrate', 'reconcile']) {
  const module = require(`../dist-lambda/${name}.js`);
  if (typeof module.handler !== 'function') throw new Error(`${name}.js does not export a handler`);
  console.log(`dist-lambda/${name}.js exports handler`);
}
