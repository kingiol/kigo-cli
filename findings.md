# Findings & Decisions

## Requirements
- Continue the unfinished implementation from the previously delivered alignment roadmap.
- Prioritize the next concrete slice instead of pretending the full roadmap can land in one pass.
- Land a real `plan` approval flow in CLI.
- Make CLI and Desktop use the same approval policy semantics.

## Research Findings
- Current CLI `plan` mode only switches the active agent to `plan`; it is not a real approval workflow.
- Current CLI permission logic is a local controller with `allow`, `block`, `dontAsk`, and `allowOnce`.
- Current Desktop approval logic asks the UI for every tool execution and ignores config-based risk semantics.
- The least risky unification point is a shared approval evaluator in `@kigo/core`, with app-specific prompting on top.
- The next lowest-cost task alignment step is command-surface unification: keep the old sub-agent runner, but let `/task` operate on the project task graph directly.
- After command-surface unification, the next useful step is storage unification: move task run records into project state and attach the latest execution result to the task node itself.
- After storage unification, the lowest-cost next step is event visibility: expose a read-only task history view backed by a project-level JSONL log.
- A separate run store can still exist temporarily, but failed execution state should also be visible on the task node or later orchestration will have to join two stores.
- The next step after event visibility is node ownership: the task node should carry a bounded execution history summary so orchestration state can be recovered without reading run files first.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Introduce shared approval policy types and evaluation in core | Shared behavior should not live in app-specific code |
| Keep persistent decisions in the existing config arrays | Avoid config migration while still supporting "always allow" and "always deny" |
| Add a plan session state machine in CLI runtime | Agent switching alone is too weak and too easy to bypass |
| Keep Desktop UI changes minimal | M2 needs consistent semantics first, not a larger panel redesign |
| Unify `/task` at the command layer first | This reduces user-facing drift without forcing a risky storage rewrite in one pass |
| Move task run persistence into project state before adding worktrees | Worktree and team orchestration need inspectable per-project state, not home-dir session files |
| Add a read-only `/task history` before any task replay features | Inspection is needed now, mutation semantics can wait |
| Store bounded execution summaries on task nodes | This makes the node the orchestration root while keeping large outputs out of the task JSON |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Ink UI and single-prompt CLI both use the same runtime | Use runtime-level approval hooks so both entry points behave consistently |

## Resources
- `/Users/dingxiaokang/Desktop/kigo-cli/apps/cli/src/interactive/runtime.ts`
- `/Users/dingxiaokang/Desktop/kigo-cli/apps/cli/src/interactive/PermissionController.ts`
- `/Users/dingxiaokang/Desktop/kigo-cli/apps/desktop/src/main/chat.ts`
- `/Users/dingxiaokang/Desktop/kigo-cli/packages/core/src/agent/ExecutionMode.ts`

## Visual/Browser Findings
- None in this pass.
