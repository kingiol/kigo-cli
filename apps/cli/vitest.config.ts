import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@kigo/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@kigo/core/': fileURLToPath(new URL('../../packages/core/src/', import.meta.url)),
      '@kigo/config': fileURLToPath(new URL('../../packages/config/src/index.ts', import.meta.url)),
      '@kigo/config/': fileURLToPath(new URL('../../packages/config/src/', import.meta.url)),
      '@kigo/tools': fileURLToPath(new URL('../../packages/tools/src/index.ts', import.meta.url)),
      '@kigo/tools/': fileURLToPath(new URL('../../packages/tools/src/', import.meta.url)),
    },
  },
});
