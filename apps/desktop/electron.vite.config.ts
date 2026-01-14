import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const nodeSqliteShim = resolve(__dirname, 'src/main/shims/node-sqlite.ts');

export default defineConfig({
  main: {
    entry: 'src/main/index.ts',
    resolve: {
      alias: {
        '@kigo/tools': resolve(__dirname, '../../packages/tools/src/index.ts'),
        '@kigo/tools/': resolve(__dirname, '../../packages/tools/src/'),
        '@kigo/core': resolve(__dirname, '../../packages/core/src/index.ts'),
        '@kigo/core/': resolve(__dirname, '../../packages/core/src/'),
        '@kigo/mcp': resolve(__dirname, '../../packages/mcp/src/index.ts'),
        '@kigo/mcp/': resolve(__dirname, '../../packages/mcp/src/'),
        '@kigo/auth': resolve(__dirname, '../../packages/auth/src/index.ts'),
        '@kigo/auth/': resolve(__dirname, '../../packages/auth/src/'),
        '@': resolve(__dirname, 'src/main')
      }
    },
    build: {
      rollupOptions: {
      }
    }
  },
  preload: {
    entry: 'src/preload/index.ts',
    resolve: {
      alias: {
        '@kigo/tools': resolve(__dirname, '../../packages/tools/src/index.ts'),
        '@kigo/tools/': resolve(__dirname, '../../packages/tools/src/'),
        '@kigo/core': resolve(__dirname, '../../packages/core/src/index.ts'),
        '@kigo/core/': resolve(__dirname, '../../packages/core/src/'),
        '@kigo/mcp': resolve(__dirname, '../../packages/mcp/src/index.ts'),
        '@kigo/mcp/': resolve(__dirname, '../../packages/mcp/src/'),
        '@kigo/auth': resolve(__dirname, '../../packages/auth/src/index.ts'),
        '@kigo/auth/': resolve(__dirname, '../../packages/auth/src/')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [react()]
  }
});
