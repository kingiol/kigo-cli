# Contributing to Kigo CLI

Thank you for your interest in contributing to Kigo! This guide provides everything you need to know about the project structure, development workflow, and release process.

## 📂 Project Structure

The project is a monorepo managed by pnpm workspaces:

```
kigo-node/
├── packages/
│   ├── core/                 # Core framework (Agent, Session, Models)
│   ├── tools/                # Built-in tools (File, Shell, Search, etc.)
│   ├── mcp/                  # MCP (Model Context Protocol) client
│   └── auth/                 # Authentication providers
│
└── apps/
    └── cli/                 # Main CLI application
        ├── src/
        │   ├── commands/     # CLI subcommands
        │   ├── display/      # Terminal UI
        │   └── config/       # Configuration
        └── scripts/          # Build and release scripts
```

## 🛠️ Development Setup

### Prerequisites
- Node.js >= 20.0.0
- pnpm

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @kigo/core build
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @kigo/tools test
```

## 🧩 Extending Kigo

### Adding a New Tool
1. Create tool definition in `packages/tools/src/<category>/`:
   ```typescript
   import { z } from 'zod';
   import { tool } from '../registry.js';

   tool({
     name: 'my_tool',
     description: 'Description',
     schema: z.object({ param: z.string() }),
     execute: async ({ param }) => { /* ... */ },
   });
   ```
2. Export from `packages/tools/src/index.ts`.

### Adding a New LLM Provider
1. Create provider in `packages/core/src/models/`:
   ```typescript
   export class MyProvider extends BaseProvider {
     async *chat(options: ChatOptions) { /* ... */ }
   }
   ```
2. Register in `ProviderFactory.ts`.

## 🖥️ Cross-Platform Support

Kigo CLI supports macOS, Linux, and Windows (x64 and arm64).

### Native Modules
We use `better-sqlite3`, which requires native compilation.
- **Development**: Handled automatically by `pnpm install` (uses `node-gyp` or prebuilds).
- **Distribution**:
    - **NPM**: Uses `prebuild-install` to fetch binaries.
    - **Binaries**: We use `caxa` to package the CLI with a bundled Node.js executable, preserving native modules.

### Platform Specifics
- **Shebang**: `#!/usr/bin/env node` is used for Unix-like systems. Windows ignores this and uses the `.cmd` wrapper.
- **Path Handling**: Use `path.join()` or `upath` for cross-platform path compatibility.

## 🚀 Release Process

We accept multiple distribution methods: NPM (primary), Binary (GitHub Releases), and Source.

### Release Checklist
1. **Update Versions**: Update `package.json` versions.
2. **Update Changelog**: Add entry to `CHANGELOG.md`.
3. **Tests**: Ensure `pnpm test` passes locally.

### Publishing

#### Method A: GitHub Actions (Recommended)
1. Commit changes: `git commit -m "chore: release v0.1.0"`
2. Tag version: `git tag v0.1.0`
3. Push: `git push origin v0.1.0`

The **Release Workflow** (`.github/workflows/release.yml`) will automatically:
- Build and test on macOS, Linux, and Windows.
- Create a GitHub Release with binary artifacts.
- Publish to npm (requires `NPM_TOKEN` secret).

#### Method B: Manual NPM Publish

1. **Setup Authentication** (First time only):

   ```bash
   # Login to npm registry
   npm login --registry=https://registry.npmjs.org/
   
   # Verify login status
   npm whoami --registry=https://registry.npmjs.org/
   ```

   *Troubleshooting*: If you encounter "You must be logged in", try setting the token manually:
   ```bash
   npm config set //registry.npmjs.org/:_authToken YOUR_NPM_TOKEN
   ```

2. **Publish**:

   ```bash
   # 1. Ensure project is built
   pnpm build
   
   # 2. Go to CLI directory
   cd apps/cli
   
   # 3. Dry run (optional, to see what will be published)
   npm pack --dry-run
   
   # 4. Publish
   npm publish --access public --registry=https://registry.npmjs.org/
   ```

### Manual Binary Build
If you need to build binaries locally:
```bash
# macOS/Linux
./apps/cli/scripts/build-binary.sh

# Windows
.\apps\cli\scripts\build-binary.bat
```
Artifacts will be in `apps/cli/dist/binaries/`.

## 🤝 Code Style
- Use TypeScript strict mode.
- Follow existing naming conventions.
- Keep functions small and focused.
