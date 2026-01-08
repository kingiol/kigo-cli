# Claude Integration Guide

> Using Anthropic's Claude models with Kigo

## Overview

Kigo supports Claude models through the Anthropic API, providing access to Claude's powerful reasoning and coding capabilities. This guide covers setup, configuration, and best practices for using Claude with Kigo.

## Supported Models

| Model | Description | Context Window | Best For |
|-------|-------------|----------------|----------|
| `claude-opus-4-20250514` | Most capable model | 200K tokens | Complex reasoning, large codebases |
| `claude-sonnet-4-20250514` | Balanced performance | 200K tokens | General development tasks |
| `claude-3-5-sonnet-20241022` | Fast and efficient | 200K tokens | Quick iterations, refactoring |
| `claude-3-5-haiku-20241022` | Fastest model | 200K tokens | Simple tasks, rapid responses |

## Quick Start

### 1. Get API Key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Navigate to API Keys section
3. Create a new API key

### 2. Configure Environment

```bash
# Set your Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Optional: Set default model
export KODER_MODEL="claude-opus-4-20250514"
```

### 3. Run Kigo with Claude

```bash
# Use default Claude model
kigo

# Specify a specific Claude model
KODER_MODEL="claude-sonnet-4-20250514" kigo

# Interactive session with Claude
kigo -s my-project "help me refactor this code"
```

## Configuration

### Via Config File

Edit `~/.kigo/config.yaml`:

```yaml
model:
  name: "claude-opus-4-20250514"
  provider: "anthropic"
  reasoning_effort: null

cli:
  session: null
  stream: true
```

### Via Environment Variables

```bash
# Model selection
export KODER_MODEL="claude-opus-4-20250514"

# API key
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Optional: Custom API base URL
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
```

### Via CLI Arguments

```bash
kigo --model claude-opus-4-20250514 "your prompt"
```

## Features

### Streaming Responses

Claude supports real-time streaming for immediate feedback:

```typescript
// Enabled by default in Kigo
const response = await provider.chat({
  messages: [...],
  stream: true,
});

for await (const chunk of response) {
  // Process streaming chunks
}
```

### Tool Use

Claude excels at using tools. All Kigo built-in tools work seamlessly:

```bash
kigo "create a new React component with tests"
```

Claude will automatically:
- Use `write_file` to create component files
- Use `todo_write` to track implementation steps
- Use `run_shell` to run tests
- Use `grep_search` to find related code

### Extended Context

Claude models support up to 200K tokens, enabling:
- Large codebase analysis
- Multi-file refactoring
- Comprehensive documentation generation

## Best Practices

### Model Selection

**Use Claude Opus 4 when:**
- Working with complex architectural decisions
- Analyzing large codebases
- Requiring deep reasoning about code design
- Handling multi-step refactoring

**Use Claude Sonnet 4 when:**
- General development tasks
- Balanced speed and quality needed
- Working on medium-sized features

**Use Claude Haiku when:**
- Quick code reviews
- Simple file edits
- Fast iterations needed
- Cost optimization is priority

### Prompt Engineering

Claude responds well to structured prompts:

```bash
# Good: Clear, specific request
kigo "Refactor the UserService class to use dependency injection. 
Extract the database logic into a separate repository pattern."

# Better: Include context and constraints
kigo "Refactor UserService to use dependency injection:
1. Create IUserRepository interface
2. Extract DB logic to UserRepository class
3. Update tests to use mocks
4. Maintain backward compatibility"
```

### Session Management

Use named sessions for complex projects:

```bash
# Start a session
kigo -s backend-refactor "analyze the current architecture"

# Continue the session (maintains context)
kigo -s backend-refactor "implement the repository pattern"

# Later...
kigo -s backend-refactor "update the tests"
```

## Advanced Usage

### Custom System Prompts

Modify the system prompt for specialized behavior:

```typescript
import { Agent } from '@kigo/core';
import { AnthropicProvider } from '@kigo/core/models';

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-opus-4-20250514',
});

const agent = new Agent({
  provider,
  systemPrompt: `You are a senior TypeScript developer specializing in 
  clean architecture and test-driven development. Always suggest tests 
  alongside implementation.`,
  tools: [...],
});
```

### Rate Limiting

Claude API has rate limits. Handle gracefully:

```typescript
try {
  const response = await provider.chat(options);
} catch (error) {
  if (error.status === 429) {
    // Rate limited - implement retry logic
    await sleep(1000);
    // Retry...
  }
}
```

### Cost Optimization

Monitor token usage:

```bash
# Use Haiku for simple tasks
KODER_MODEL="claude-3-5-haiku-20241022" kigo "fix typo in README"

# Use Opus only when needed
KODER_MODEL="claude-opus-4-20250514" kigo "design the entire system architecture"
```

## Troubleshooting

### API Key Issues

```bash
# Verify API key is set
echo $ANTHROPIC_API_KEY

# Test API access
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-opus-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Model Not Found

Ensure you're using a valid model name:

```bash
# Check available models in config
kigo config show

# Update to valid model
kigo config set model.name "claude-opus-4-20250514"
```

### Streaming Issues

If streaming fails, check your network:

```bash
# Disable streaming temporarily
kigo --no-stream "your prompt"
```

## Provider Implementation

The Claude integration is implemented in `packages/core/src/models/AnthropicProvider.ts`:

```typescript
export class AnthropicProvider extends BaseProvider {
  async *chat(options: ChatOptions): AsyncIterable<StreamChunk> {
    // Streaming implementation
  }

  async chatNonStream(options: ChatOptions): Promise<ChatResponse> {
    // Non-streaming implementation
  }
}
```

Key features:
- Automatic message format conversion
- Tool use support with streaming
- Error handling and retries
- Token usage tracking

## Comparison with Other Providers

| Feature | Claude | GPT-4 | Local Models |
|---------|--------|-------|--------------|
| Context Window | 200K | 128K | Varies |
| Tool Use | Excellent | Excellent | Limited |
| Streaming | Yes | Yes | Yes |
| Cost | Medium | Medium | Free |
| Speed | Fast | Fast | Varies |
| Code Quality | Excellent | Excellent | Good |

## Resources

- [Anthropic Documentation](https://docs.anthropic.com)
- [Claude API Reference](https://docs.anthropic.com/claude/reference)
- [Model Pricing](https://www.anthropic.com/pricing)
- [Best Practices](https://docs.anthropic.com/claude/docs/best-practices)

## Examples

### Create a Full-Stack Feature

```bash
kigo -s feature "Create a user authentication system:
- JWT-based auth
- Login/register endpoints
- Password hashing with bcrypt
- Protected routes middleware
- Unit tests for all components"
```

### Refactor Legacy Code

```bash
kigo -s refactor "Analyze the legacy UserController and:
1. Identify code smells
2. Suggest modern patterns
3. Implement the refactoring
4. Update tests
5. Document the changes"
```

### Debug Complex Issues

```bash
kigo "The authentication middleware is failing intermittently.
Analyze the code, check for race conditions, and fix the issue."
```

## Contributing

To improve Claude integration:

1. Check `packages/core/src/models/AnthropicProvider.ts`
2. Review test coverage in `packages/core/tests/`
3. Submit PRs with improvements

---

<p align="center">
  <sub>Powered by Claude's advanced reasoning capabilities</sub>
</p>
