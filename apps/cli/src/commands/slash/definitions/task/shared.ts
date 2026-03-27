import type { TaskProfile } from "@kigo/tools";

export const PROFILES: TaskProfile[] = [
  "general-purpose",
  "explore",
  "plan",
  "claude-code-guide",
  "statusline-setup",
];

export const TASK_COMMAND_USAGE =
  "Usage: /task [list|board|ready|scheduler|create <subject>|show <id>|history [taskId|runId]|thread <taskId|runId> [--pending]|protocol <taskId|runId>|claim <id> [owner]|auto-claim [limit] [owner]|run|execute <id>|execute-ready [limit] [profile] [--background]|cleanup <id>|output <taskId|runId>|resume <taskId|runId>|answer <taskId|runId> -- <message>|approve <taskId|runId> <approve|reject> [-- <note>]]";

export function isTaskProfile(value: string | undefined): value is TaskProfile {
  return value ? PROFILES.includes(value as TaskProfile) : false;
}

export function isNumericId(value: string | undefined): boolean {
  return !!value && /^\d+$/.test(value);
}
