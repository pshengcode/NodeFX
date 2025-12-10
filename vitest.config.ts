/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    globals: true,
  },
});
