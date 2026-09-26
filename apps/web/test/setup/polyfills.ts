import { TextDecoder, TextEncoder } from 'node:util';

// React Router 7 necesita TextEncoder/TextDecoder, que jsdom no expone.
Object.assign(globalThis, { TextEncoder, TextDecoder });

// jsdom no implementa el scroll; ScrollRestoration de React Router lo usa al navegar.
if (typeof window !== 'undefined') window.scrollTo = () => undefined;
