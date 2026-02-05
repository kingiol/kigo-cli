import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs'],
    clean: true,
    bundle: true,
    // Bundle all dependencies
    noExternal: [/^(?!better-sqlite3|ink|ink-text-input|react|react-devtools-core|yoga-layout).*/],
    minify: false, // Keep readable for now, set to true for final build
    sourcemap: true,
    outDir: 'dist',
    target: 'node20',
    external: [
        'better-sqlite3',
        'ink',
        'ink-text-input',
        'react',
        'react-devtools-core',
        'yoga-layout',
    ],
    shims: true,
});
