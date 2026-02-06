import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@kigo/config': fileURLToPath(new URL('../../packages/config/src/index.ts', import.meta.url)),
      '@kigo/config/': fileURLToPath(new URL('../../packages/config/src/', import.meta.url)),
    },
  },
});
