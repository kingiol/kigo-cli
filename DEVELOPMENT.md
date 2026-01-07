# Development Guide

## Project Structure

```
koder-node/
├── packages/
│   ├── core/                 # Core framework
│   │   ├── src/
│   │   │   ├── agent/        # Agent, Scheduler, Hooks
│   │   │   ├── session/      # Session management
│   │   │   └── models/       # LLM providers
│   │   └── package.json
│   │
│   ├── tools/                # Built-in tools
│   │   ├── src/
│   │   │   ├── file/         # File operations
│   │   │   ├── shell/        # Shell commands
│   │   │   ├── search/       # Search tools
│   │   │   ├── web/          # Web tools
│   │   │   ├── skill/        # Skill system
│   │   │   └── todo/         # Todo management
│   │   └── package.json
│   │
│   ├── mcp/                  # MCP client
│   │   ├── src/
│   │   │   ├── transports/   # Stdio, SSE, HTTP
│   │   │   └── client.ts
│   │   └── package.json
│   │
│   └── auth/                 # OAuth authentication
│       ├── src/
│       │   ├── providers/    # Google, Claude, etc.
│       │   └── TokenStorage.ts
│       └── package.json
│
└── apps/
    └── cli/                 # Main CLI application
        ├── src/
        │   ├── commands/     # CLI subcommands
        │   ├── display/      # Terminal UI
        │   ├── config/       # Configuration
        │   └── interactive.ts
        └── package.json
```

## Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @koder/core build
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @koder/tools test
```

## Adding a New Tool

1. Create the tool file in `packages/tools/src/<category>/`

```typescript
import { z } from 'zod';
import { tool } from '../registry.js';

export const myToolSchema = z.object({
  param: z.string(),
});

tool({
  name: 'my_tool',
  description: 'Description of what this tool does',
  schema: myToolSchema,
  execute: async ({ param }) => {
    // Tool implementation
    return 'Result';
  },
});
```

2. Export from `packages/tools/src/index.ts`

```typescript
export * from './myCategory/myTool.js';
```

## Adding a New LLM Provider

1. Create provider in `packages/core/src/models/`

```typescript
import { BaseProvider } from './BaseProvider.js';

export class MyProvider extends BaseProvider {
  async *chat(options: ChatOptions): AsyncIterable<StreamChunk> {
    // Implementation
  }

  async chatNonStream(options: ChatOptions): Promise<ChatResponse> {
    // Implementation
  }
}
```

2. Add to `ProviderFactory.ts`

```typescript
case 'myprovider':
  return new MyProvider({ apiKey, baseUrl, model });
```

## Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep functions focused and small

## Release Process

1. Update version numbers in `package.json` files
2. Update `CHANGELOG.md`
3. Create git tag
4. Publish to npm
