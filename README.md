# Koder Node.js

> AI coding assistant for the terminal - Node.js port of Koder

[![Node.js](https://img.shields.io/badge/node-20+-blue.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An experimental, universal AI coding assistant for the terminal. Built in TypeScript, Koder works with OpenAI, Anthropic, and other LLM providers.

## Features

- **Universal AI Support** - Works with OpenAI, Anthropic, and other providers
- **Smart Context** - Persistent sessions with SQLite storage
- **Real-time Streaming** - Rich terminal displays with live output
- **Comprehensive Tools** - File operations, search, shell, todos, and skills
- **MCP Integration** - Extensible tool ecosystem via Model Context Protocol
- **Zero Config** - Automatic provider detection with sensible defaults

## Installation

### Using pnpm (Recommended)

```bash
pnpm install -g koder-node
```

### Using npm

```bash
npm install -g koder-node
```

## Quick Start

```bash
# 1. Set your API key
export OPENAI_API_KEY="your-api-key"

# 2. Run Koder
koder
```

### Basic Usage

```bash
# Interactive mode
koder

# Single prompt
koder "create a Python function to calculate fibonacci numbers"

# Named session (persists conversation)
koder -s my-project "help me implement a new feature"

# Use a different model
KODER_MODEL="claude-opus-4-20250514" koder "your prompt"
```

## Configuration

Koder can be configured via (in priority order):

1. **CLI arguments** - Highest priority
2. **Environment variables** - `KODER_MODEL`, `KODER_REASONING_EFFORT`
3. **Config file** - `~/.koder/config.yaml`

### Config File Example

```yaml
model:
  name: "gpt-4o"
  provider: "openai"
  reasoning_effort: null

cli:
  session: null
  stream: true

mcp_servers: []

skills:
  enabled: true
  project_skills_dir: ".koder/skills"
  user_skills_dir: "~/.koder/skills"
```

### Commands

```bash
koder config show          # Show current config
koder config path          # Show config file path
koder config edit          # Edit config file
koder config init          # Initialize config with defaults
koder config set <key> <value>  # Set a config value
```

## Built-in Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with line numbers |
| `write_file` | Write files with diff display |
| `edit_file` | Edit files using unified diff |
| `list_directory` | List directory contents |
| `run_shell` | Execute shell commands |
| `shell_output` | Get output from background shells |
| `shell_kill` | Terminate background shells |
| `git_command` | Execute git commands |
| `glob_search` | Find files by pattern |
| `grep_search` | Search file contents |
| `web_search` | Search the web (DuckDuckGo) |
| `web_fetch` | Fetch and analyze web pages |
| `todo_read` | Read todo list |
| `todo_write` | Write todo list |
| `get_skill` | Load skill content |

## MCP Integration

Model Context Protocol (MCP) servers extend Koder with additional tools.

### CLI Commands

```bash
# Add servers
koder mcp add myserver "python -m my_mcp_server"
koder mcp add myserver "python -m server" -e API_KEY=xxx

# HTTP/SSE transport
koder mcp add webserver --transport http --url http://localhost:8000

# Manage servers
koder mcp list
koder mcp get myserver
koder mcp remove myserver
```

### Config Example

```yaml
mcp_servers:
  - name: "filesystem"
    transport_type: "stdio"
    command: "python"
    args: ["-m", "mcp.server.filesystem"]
    env_vars:
      ROOT_PATH: "/home/user/projects"
    cache_tools_list: true
    allowed_tools:
      - "read_file"
      - "write_file"
```

## Skills

Skills provide specialized knowledge loaded on-demand, saving tokens via progressive disclosure.

### Directory Structure

Skills are loaded from (project skills take priority):

1. **Project**: `.koder/skills/`
2. **User**: `~/.koder/skills/`

### Creating a Skill

Create a `SKILL.md` with YAML frontmatter:

```markdown
---
name: api-design
description: Best practices for designing RESTful APIs
allowed-tools:
  - read_file
  - write_file
---

# API Design Guidelines

## RESTful Principles

Use nouns for resources, HTTP verbs for actions...
```

## Architecture

```
koder-node/
├── packages/
│   ├── core/         # Core framework
│   ├── tools/        # Built-in tools
│   ├── mcp/          # MCP client
│   └── auth/         # OAuth authentication
└── apps/
    └── cli/          # Main CLI application
```

## Development

### Setup

```bash
git clone https://github.com/yourusername/koder-node.git
cd koder-node
pnpm install
pnpm build
```

### Code Quality

```bash
pnpm lint              # Lint code
pnpm test              # Run tests
```

## Security

- **API Keys**: Stored in environment variables, never in code
- **Local Storage**: Sessions stored in `~/.koder/`
- **No Telemetry**: Only API requests to your chosen provider
- **Shell Commands**: Require explicit user confirmation

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with TypeScript and curiosity</sub>
</p>
