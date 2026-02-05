---
title: Desktop CLI Parity Design
date: 2026-02-05
---

**Goal**
Replicate CLI features in Desktop, keep `lsp` CLI-only, and expand the Desktop configuration UI to cover all config fields.

**Architecture**
Use a shared config package in `packages/config` for schema, IO, and config manager utilities. Both CLI and Desktop import this package to avoid drift.

Desktop remains split into three layers:
1. Shared logic in `packages` for config, tools, MCP, auth, and skills.
2. Desktop main process exposes feature parity via IPC.
3. Desktop renderer provides UI for configuration, MCP, skills, auth, sessions, and chat.

**Data Flow**
Configuration loads from `@kigo/config` and is edited in the renderer. Changes are validated via Zod and persisted through IPC. Skills and MCP read from the same config and refresh after saves.

**IPC Surface**
Config: `get`, `save`, `path`, `init`, `set`.
MCP: `list`, `add`, `remove`, `test`.
Auth: `login`, `list`, `status`, `revoke`.
Skills: `list`, `get`, `refresh`.
Chat and sessions remain as existing channels.
App: `quit`.

**UI**
Configuration UI exposes all schema fields. Advanced options are behind a toggle. YAML view and quick-set are provided for parity with CLI `config show` and `config set`.
MCP UI supports full fields including headers, env vars, and allow/deny lists.
Skills UI lists discovered skills and shows full content and allowed tools.
Auth UI lists providers, supports login and revoke, and shows expiration status.

**LSP**
Desktop remains CLI-only, with a UI hint to run `kigo lsp` in a terminal.

**Error Handling**
Graceful default fallback on config load errors. IPC errors surface as toast or inline status messages. Tool approvals and chat failures are displayed without losing state.

**Testing**
Unit tests should cover config load/save validation and the skills loader configuration. IPC flows can be smoke-tested via renderer integration.
