# Kigo CLI (Node.js)

> AI coding assistant for the terminal, built with Node.js and TypeScript

[![Node.js](https://img.shields.io/badge/node-20+-blue.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Kigo** is a CLI-based AI coding assistant designed to bring agentic capabilities directly to your terminal. It integrates with multiple LLM providers, uses a tool system for file/shell/web tasks, and stores sessions locally for persistent context.

Built with a modular monorepo architecture, Kigo includes a CLI app, core agent/session logic, tool implementations, MCP client support, OAuth helpers, and an optional LSP server for editor integrations.

## Features

- **Multi-Provider Support** - OpenAI, Anthropic, Azure, plus OpenAI-compatible providers via base URL.
- **Agentic Tooling** - File editing, shell commands, directory listing, search, and web fetch/search tools.
- **Persistent Sessions** - SQLite-backed session storage with local history.
- **MCP Integration** - Extensible tool ecosystem support via the Model Context Protocol.
- **Skills System** - Load specialized knowledge on-demand via `SKILL.md`.
- **LSP Server** - Optional `kigo lsp` command to start a stdio language server.

## Installation

### Using pnpm (Recommended)

```bash
pnpm add -g @kingiol/kigo-cli
```

### Using npm

```bash
npm install -g @kingiol/kigo-cli
```

For other installation methods, see `docs/INSTALLATION.md`.

## Quick Start

```bash
# 1. Set your API key
export OPENAI_API_KEY="your-api-key"

# 2. Run Kigo
kigo
```

### Basic Usage

```bash
# Interactive mode
kigo

# Named session (persists conversation)
kigo -s my-project "help me implement a new feature"

# Use a different model
KIGO_MODEL="claude-opus-4-20250514" kigo "your prompt"
```

Note: single-prompt execution is currently stubbed in the CLI; interactive mode is the primary workflow today.

## Configuration

Kigo can be configured via (in priority order):

1. **CLI arguments** - Highest priority
2. **Environment variables** - `KIGO_MODEL`, `KIGO_REASONING_EFFORT`
3. **Config file** - `~/.kigo/config.yaml`

### Config File Example

```yaml
model:
  name: "gpt-4o"
  provider: "openai"
  reasoningEffort: null

cli:
  session: null
  stream: true

mcpServers: []

skills:
  enabled: true
  projectSkillsDir: ".kigo/skills"
  userSkillsDir: "~/.kigo/skills"
```

### Commands

```bash
kigo config show          # Show current config
kigo config path          # Show config file path
kigo config edit          # Edit config file
kigo config init          # Initialize config with defaults
kigo config set <key> <value>  # Set a config value
kigo auth login google    # OAuth login (Google)
kigo auth status          # Auth status
kigo mcp list             # List MCP servers
kigo lsp                  # Start LSP server (stdio)
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
| `todo_read` | Read the current todo list |
| `todo_write` | Write the todo list (replace all todos) |
| `answer_questions` | Ask multi-choice questions and collect responses |
| `sub_agent_run` | Run a specialized sub-agent to handle a sub-task |
| `get_skill` | Load skill content |

## MCP Integration

Model Context Protocol (MCP) servers extend Kigo with additional tools.

### CLI Commands

```bash
# Add servers
kigo mcp add myserver "python -m my_mcp_server"
kigo mcp add myserver "python -m server" -e API_KEY=xxx

# HTTP/SSE transport
kigo mcp add webserver --transport http --url http://localhost:8000

# Manage servers
kigo mcp list
kigo mcp get myserver
kigo mcp remove myserver
```

### Config Example

```yaml
mcpServers:
  - name: "filesystem"
    transportType: "stdio"
    command: "python"
    args: ["-m", "mcp.server.filesystem"]
    envVars:
      ROOT_PATH: "/home/user/projects"
    cacheToolsList: true
    allowedTools:
      - "read_file"
      - "write_file"
```

## Skills

Skills provide specialized knowledge loaded on-demand, saving tokens via progressive disclosure.

### Directory Structure

Skills are loaded from (project skills take priority):

1. **Project**: `.kigo/skills/`
2. **User**: `~/.kigo/skills/`

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
kigo-node/
├── packages/
│   ├── core/         # Core framework
│   ├── tools/        # Built-in tools
│   ├── mcp/          # MCP client
│   ├── auth/         # OAuth authentication
│   └── lsp/          # LSP server
└── apps/
    └── cli/          # Main CLI application
```

## Development

### Setup

```bash
git clone <this-repo>
cd kigo-node
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
- **Local Storage**: Sessions stored in `~/.kigo/`
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
