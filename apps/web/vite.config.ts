import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
  build: {
    // iOS/Safari 15 forman parte del objetivo (iPhone SE 2020).
    target: ['es2022', 'chrome107', 'edge107', 'firefox104', 'safari15'],
    sourcemap: false,
    rollupOptions: {
      output: {
        // The framework changes far less often than the app: its own chunk survives deploys in
        // the browser cache (assets are immutable, content-hashed).
        manualChunks: (id) =>
          /node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)
            ? 'framework'
            : undefined,
      },
    },
  },
});
