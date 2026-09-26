import { TextDecoder, TextEncoder } from 'node:util';

// React Router 7 necesita TextEncoder/TextDecoder, que jsdom no expone.
Object.assign(globalThis, { TextEncoder, TextDecoder });
