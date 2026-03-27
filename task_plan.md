# Task Plan: M2 follow-up on task state unification and task-node ownership

## Goal
Continue the unfinished alignment work by tightening task-state unification around the project task graph and making task nodes the orchestration root.

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach
- [x] Decide shared ownership between core, CLI, and Desktop
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Move task run persistence into project state
- [x] Mirror latest run metadata back into task nodes
- [x] Add task event history command surface
- [x] Add failed-state and event-log verification
- [x] Persist execution history summaries on task nodes
- [x] Expose node-owned execution history in CLI inspection
- [x] Let `/task output` and `/task resume` fall back to node-owned execution summaries
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Add tests for node-owned execution history
- [x] Add tests for node fallback after removing task-runs file
- [x] Run build, test, and lint
- [x] Fix any regressions
- **Status:** complete

### Phase 5: Delivery
- [x] Review changed files
- [x] Summarize what is still unfinished
- [ ] Deliver to user
- **Status:** in_progress

## Key Questions
1. How do we make task nodes the main orchestration object without ripping out the legacy `/task run` flow in one pass?
2. Which execution details must live on the node so later worktrees and agents can recover state without parsing external logs?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep this pass on task-state unification only | Pulling in worktrees or team inboxes now would widen the change too much |
| Use per-project JSONL for task events | Event history needs to be inspectable and easy to recover after restart |
| Mark failed executions on the task node itself | Later orchestration should not need to infer failure from a separate run store |
| Keep `task-runs` as a legacy session view for now | Removing it now would break old `/task output` and `/task resume` behavior |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
- Do not break the old `/task run` and `/task output` session workflow while exposing task-graph history.
- Keep event history read-only for now; no replay or mutation commands in this pass.
