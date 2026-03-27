import chalk from "chalk";
import type { TaskCommandContext } from "../../types.js";
import {
  formatDispatchTarget,
  formatExecutionSummary,
  formatOptionalTime,
  formatProtocolMessage,
  formatTaskEvent,
  formatTaskNode,
  formatThreadMessage,
} from "./formatters.js";
import { isNumericId } from "./shared.js";

export async function handleTaskQueryAction(
  action: string,
  args: string[],
  context: TaskCommandContext,
): Promise<boolean> {
  const taskManager = context.taskManager;
  if (!taskManager) {
    console.log("Task manager not available.");
    return true;
  }

  if (action === "list") {
    const tasks = taskManager.list();
    if (tasks.length === 0) {
      console.log("No tasks.");
      return true;
    }

    console.log(`\n${chalk.bold("Tasks:")}`);
    for (const task of tasks) {
      console.log(`  - ${task.id} [${task.status}] (${task.profile}) ${task.task.slice(0, 80)}`);
    }
    console.log("");
    return true;
  }

  if (action === "board") {
    const tasks = await taskManager.listTaskNodes();
    if (tasks.length === 0) {
      console.log("No task graph nodes.");
      return true;
    }

    console.log(`\n${chalk.bold("Task Board:")}`);
    for (const task of tasks) {
      console.log(formatTaskNode(task));
    }
    console.log("");
    return true;
  }

  if (action === "ready") {
    const targets = await taskManager.listDispatchTargets();
    if (targets.length === 0) {
      console.log("No ready or resumable task nodes.");
      return true;
    }

    console.log(`\n${chalk.bold("Dispatchable Task Nodes:")}`);
    for (const target of targets) {
      console.log(formatDispatchTarget(target));
    }
    console.log("");
    return true;
  }

  if (action === "scheduler") {
    const getSchedulerState = context.getTaskSchedulerState;
    if (!getSchedulerState) {
      console.log("Task scheduler state not available.");
      return true;
    }

    const state = getSchedulerState();
    const dispatchStats = await taskManager.getDispatchStats();
    const previewTargets = await taskManager.listDispatchTargets({ limit: 3 });
    const runningTasks = taskManager.getStats().running;
    console.log(`
${chalk.bold("Task Scheduler:")}
  enabled: ${state.enabled ? "yes" : "no"}
  pollMs: ${state.pollMs}
  planMode: ${context.isPlanModeEnabled ? (context.isPlanModeEnabled() ? "on" : "off") : "-"}
  interactiveRuns: ${state.interactiveRunCount}
  autoResumeInFlight: ${state.autoResumeInFlight ? "yes" : "no"}
  runningTasks: ${runningTasks}
  resumableTargets: ${dispatchStats.resumable}
  executableTargets: ${dispatchStats.executable}
  lastTickAt: ${formatOptionalTime(state.lastTickAt)}
  lastResumeAt: ${formatOptionalTime(state.lastResumeAt)}
  lastResumedTaskId: ${state.lastResumedTaskId ?? "-"}
  lastResumeRunId: ${state.lastResumeRunId ?? "-"}
  lastResumedCount: ${state.lastResumedCount ?? 0}
  lastSkipReason: ${state.lastSkipReason ?? "-"}
  lastError: ${state.lastError ?? "-"}
`);

    if (previewTargets.length > 0) {
      console.log("  dispatchPreview:");
      for (const target of previewTargets) {
        console.log(formatDispatchTarget(target));
      }
      console.log("");
    }
    return true;
  }

  if (action === "show") {
    const rawTaskId = args[1];
    if (!isNumericId(rawTaskId)) {
      console.log("Usage: /task show <taskId>");
      return true;
    }

    const task = await taskManager.getTaskNode(Number(rawTaskId));
    const latestRecord = taskManager.getLatestTaskRecordForTaskNode(Number(rawTaskId));
    console.log(`
${chalk.bold(`#${task.id}`)}
  status: ${task.status}
  owner: ${task.owner || "-"}
  worktree: ${task.worktree || "-"}
  blockedBy: ${task.blockedBy.length ? task.blockedBy.join(", ") : "-"}
  blocks: ${task.blocks.length ? task.blocks.join(", ") : "-"}
  lastRunId: ${task.lastRunId || "-"}
  lastRunStatus: ${task.lastRunStatus || "-"}
  lastRunAt: ${task.lastRunAt ? new Date(task.lastRunAt).toLocaleTimeString() : "-"}
  mailboxId: ${latestRecord?.mailboxId || "-"}
  waitingType: ${latestRecord?.waitingType || "-"}
  subject: ${task.subject}
  description: ${task.description || "-"}
  lastRunError: ${task.lastRunError || "-"}
  lastRunOutput: ${task.lastRunOutput || "-"}
`);
    if (task.executionHistory.length > 0) {
      console.log(`  recentExecutions:`);
      for (const execution of task.executionHistory.slice(0, 3)) {
        console.log(formatExecutionSummary(execution));
      }
      console.log("");
    }
    return true;
  }

  if (action === "thread") {
    const target = args[1]?.trim();
    if (!target) {
      console.log("Usage: /task thread <taskId|runId> [--pending]");
      return true;
    }

    const messages = await taskManager.getTaskMailboxThread(target, {
      includeAcknowledged: !args.includes("--pending"),
    });
    if (messages.length === 0) {
      console.log(`No mailbox thread for ${target}.`);
      return true;
    }

    console.log(`\n${chalk.bold(`Task Thread: ${target}`)}`);
    for (const message of messages) {
      for (const line of formatThreadMessage(message)) {
        console.log(line);
      }
    }
    console.log("");
    return true;
  }

  if (action === "protocol") {
    const target = args[1]?.trim();
    if (!target) {
      console.log("Usage: /task protocol <taskId|runId>");
      return true;
    }

    const rounds = await taskManager.getTaskProtocolView(target);
    if (rounds.length === 0) {
      console.log(`No protocol rounds for ${target}.`);
      return true;
    }

    console.log(`\n${chalk.bold(`Task Protocol: ${target}`)}`);
    for (const round of rounds) {
      console.log(`  - Round ${round.index} [${round.waitingType}] ${round.waitingReason || "-"}`);
      console.log(`    request: ${formatProtocolMessage(round.request)}`);
      console.log(`    response: ${formatProtocolMessage(round.response)}`);
      console.log(`    outcome: ${round.outcome || "-"}`);
    }
    console.log("");
    return true;
  }

  if (action === "history") {
    const target = args[1]?.trim();
    const events = taskManager.listTaskEvents(
      !target
        ? { limit: 20 }
        : isNumericId(target)
          ? { taskNodeId: Number(target), limit: 20 }
          : { taskRunId: target, limit: 20 },
    );

    if (events.length === 0) {
      console.log("No task history.");
      return true;
    }

    console.log(`\n${chalk.bold("Task History:")}`);
    for (const event of events) {
      console.log(formatTaskEvent(event));
    }
    console.log("");
    return true;
  }

  return false;
}
