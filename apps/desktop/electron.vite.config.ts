import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const nodeSqliteShim = resolve(__dirname, 'src/main/shims/node-sqlite.ts');
const builtins = Array.from(
  new Set(
    builtinModules.flatMap((mod) => (mod.startsWith('node:') ? [mod, mod.slice(5)] : [mod, `node:${mod}`]))
  )
).filter((mod) => mod !== 'sqlite' && mod !== 'node:sqlite');
const isExternalBuiltin = (id: string) => {
  if (id === 'sqlite' || id === 'node:sqlite') return false;
  return builtins.includes(id);
};
const nodeSqliteAssetPlugin = () => {
  const shimSource = `
export class DatabaseSync {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export class StatementSync {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export class Session {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export class Backup {
  constructor() { throw new Error('node:sqlite is not available in this runtime.'); }
}
export default { DatabaseSync, StatementSync, Session, Backup };
`;
  let assetFileName: string | null = null;
  return {
    name: 'node-sqlite-asset',
    buildStart() {
      const refId = this.emitFile({
        type: 'asset',
        fileName: 'shims/node-sqlite.js',
        source: shimSource
      });
      assetFileName = this.getFileName(refId);
    },
    resolveId(id: string) {
      if (id === 'node:sqlite' || id === 'sqlite') {
        return nodeSqliteShim;
      }
      return null;
    },
    renderChunk(code: string) {
      if (!code.includes('node:sqlite')) return null;
      const replacement = assetFileName ? `./${assetFileName}` : './shims/node-sqlite.js';
      return {
        code: code.replace(/node:sqlite/g, replacement),
        map: null
      };
    }
  };
};

export default defineConfig({
  main: {
    entry: 'src/main/index.ts',
    plugins: [nodeSqliteAssetPlugin()],
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
        '@kigo/config': resolve(__dirname, '../../packages/config/src/index.ts'),
        '@kigo/config/': resolve(__dirname, '../../packages/config/src/'),
        'node:sqlite': nodeSqliteShim,
        '@': resolve(__dirname, 'src/main')
      },
      builtins
    },
    build: {
      rollupOptions: {
        external: isExternalBuiltin,
        plugins: [nodeSqliteAssetPlugin()]
      }
    }
  },
  preload: {
    entry: 'src/preload/index.ts',
    plugins: [nodeSqliteAssetPlugin()],
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
        '@kigo/config': resolve(__dirname, '../../packages/config/src/index.ts'),
        '@kigo/config/': resolve(__dirname, '../../packages/config/src/'),
        'node:sqlite': nodeSqliteShim
      },
      builtins
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@kigo/config/schema': resolve(__dirname, '../../packages/config/src/schema.ts')
      }
    },
    plugins: [react()]
  }
});
