# CLI Ink UI Dual-Stack Design

Date: 2026-02-05

## Goal
Introduce a new Ink-based UI for `apps/cli` while keeping the legacy UI running in parallel. Selection is controlled by `KODER_UI=legacy|ink`, defaulting to `legacy` when unset. This enables safe rollout and easy rollback.

## Requirements
- New Ink UI and legacy UI must both work.
- Selection via env var: `KODER_UI=legacy|ink`.
- Default to legacy when unset or invalid.
- All CLI output should be handled by the selected UI (interactive and non-interactive).
- Minimize duplication of core logic and reduce divergence.

## Approach (Recommended: Adapter Layer)
Create a UI abstraction layer and a shared controller to keep business logic centralized.

### 1) UI Selection
- In `apps/cli/src/index.ts`, read `process.env.KODER_UI`.
- Accept values: `legacy`, `ink`.
- Default to `legacy` for all other values.
- Route to the appropriate UI entrypoint.

### 2) Shared Controller
Extract interactive logic into a controller module, e.g. `apps/cli/src/interactive/core.ts`:
- Owns the `Agent`, `AgentScheduler`, `Session`, `SlashCommandRegistry`, and tool lifecycle.
- Exposes a small interface:
  - `start(options): Promise<ControllerHandle>`
  - `onEvent(cb)` for streaming events (text delta, tool call, tool output, done, error)
  - `onPromptState(cb)` for prompt/menu/questionnaire state changes
  - `submitInput(text)` to handle user input
  - `dispose()` to close MCP/session
- Centralizes error handling, questionnaire logic, slash command execution, and session persistence.

### 3) Legacy UI Adapter
A thin wrapper (e.g. `apps/cli/src/ui/legacy.ts`) that:
- Uses current readline/ANSI logic.
- Subscribes to controller events.
- Reuses existing display utilities (`StreamingDisplayManager`, `ToolRenderer`, markdown renderer).

### 4) Ink UI Adapter
A new Ink entrypoint (e.g. `apps/cli/src/ui/ink.tsx`) that:
- Binds controller events to React state.
- Renders streaming output, tool calls, and status line with Ink components.
- Uses a shared markdown/token rendering helper to avoid duplication of formatting logic.

## Data Flow
User input -> UI adapter -> `controller.submitInput()` -> scheduler emits streaming events -> UI adapter renders output -> controller persists session and updates usage.

## Error Handling
- Controller handles all errors and emits them via the event channel.
- Fatal init errors (missing API key, MCP init failure) throw early; UI adapter prints error and exits with code 1.
- Questionnaire input validation remains in controller to keep behavior consistent across UIs.

## Testing
- Unit test: env var selection logic.
- Controller test: mock scheduler stream, verify emitted events.
- Optional: Ink snapshot tests after stabilization.

## Rollout Plan
- Default stays legacy.
- `KODER_UI=ink` enables new UI for internal testing.
- When stable, flip default in selection logic without refactor.

## Non-Goals
- No feature changes to core agent behavior.
- No UI-specific behavior differences beyond rendering.

## Open Questions
- Whether to add a `/ui ink|legacy` slash command later (not required for initial rollout).
