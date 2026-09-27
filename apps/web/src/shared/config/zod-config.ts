import { z } from 'zod';

// zod 4 compiles object parsers with `new Function` when the page allows it, and probes that on
// the first parse. The CSP has no 'unsafe-eval', so the probe logged a violation on every load:
// parse without the JIT instead. Imported first by main.tsx, before any schema runs.
z.config({ jitless: true });
