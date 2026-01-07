# Changelog

All notable changes to Koder Node.js will be documented in this file.

## [0.1.0] - 2024-01-06

### Added
- Initial release
- Core framework with Agent, Scheduler, and Hooks
- Session management with SQLite storage
- Configuration system with YAML support
- Built-in tools:
  - File operations (read, write, edit, list)
  - Shell commands (run, background, git)
  - Search (glob, grep)
  - Web (search, fetch)
  - Todo management
- LLM providers:
  - OpenAI
  - Anthropic
- MCP client with stdio transport
- OAuth authentication (Google)
- Skill system with progressive disclosure
- Interactive CLI with streaming display
- Slash commands (/help, /clear, /status, /exit, /config, /session)
