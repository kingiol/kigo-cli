import chalk from "chalk";
import { SlashCommand, CommandContext } from "../types.js";
import type { TaskProfile } from "../../../interactive/TaskManager.js";

const PROFILES: TaskProfile[] = [
  "general-purpose",
  "explore",
  "plan",
  "claude-code-guide",
  "statusline-setup",
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function formatTaskEvent(event: {
  type: string;
  timestamp: number;
  taskRunId: string;
  taskNodeId?: number;
  status: string;
  error?: string;
}): string {
  const node = event.taskNodeId ? ` task:#${event.taskNodeId}` : "";
  const detail = event.error ? ` error:${event.error}` : "";
  return `  - ${formatTime(event.timestamp)} ${event.type}${node} run:${event.taskRunId} status:${event.status}${detail}`;
}

function formatExecutionSummary(execution: {
  runId: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}): string {
  const started = execution.startedAt ? formatTime(execution.startedAt) : "-";
  const completed = execution.completedAt ? formatTime(execution.completedAt) : "-";
  const detail = execution.error ? ` error:${execution.error}` : "";
  return `  - ${execution.runId} [${execution.status}] started:${started} completed:${completed}${detail}`;
}

function formatTaskNode(task: {
  id: number;
  status: string;
  owner: string;
  blockedBy: number[];
  subject: string;
  lastRunStatus?: string;
}): string {
  const owner = task.owner || "-";
  const blocked = task.blockedBy.length > 0 ? ` blocked:${task.blockedBy.join(",")}` : "";
  const lastRun = task.lastRunStatus ? ` lastRun:${task.lastRunStatus}` : "";
  return `  - #${task.id} [${task.status}] owner:${owner}${blocked}${lastRun} ${task.subject}`;
}

function formatDispatchTarget(target: {
  task: { id: number; subject: string; owner: string; status: string };
  mode: "execute" | "resume";
  pendingInboxCount: number;
  waitingType?: string;
}): string {
  const owner = target.task.owner || "-";
  const pending = target.pendingInboxCount > 0 ? ` inbox:${target.pendingInboxCount}` : "";
  const waiting = target.waitingType ? ` waiting:${target.waitingType}` : "";
  return `  - #${target.task.id} [${target.mode}] taskStatus:${target.task.status} owner:${owner}${waiting}${pending} ${target.task.subject}`;
}

function formatThreadMessage(message: {
  mailbox: "human" | "task";
  id: string;
  type: string;
  from: string;
  subject: string;
  body: string;
  createdAt: number;
  acknowledgedAt?: number;
}): string[] {
  const ack = message.acknowledgedAt ? ` ack:${formatTime(message.acknowledgedAt)}` : "";
  const preview = message.body.length > 160 ? `${message.body.slice(0, 160)}...` : message.body;
  return [
    `  - [${message.mailbox}] ${message.id} ${formatTime(message.createdAt)}${ack} ${message.type} from:${message.from}`,
    `    ${message.subject}`,
    `    ${preview}`,
  ];
}

function formatProtocolMessage(message?: {
  type: string;
  from: string;
  subject: string;
  body: string;
}): string {
  if (!message) {
    return "-";
  }

  const preview = message.body.length > 120 ? `${message.body.slice(0, 120)}...` : message.body;
  return `[${message.type}] from:${message.from} subject:${message.subject} body:${preview}`;
}

function formatOptionalTime(ts?: number): string {
  return ts ? formatTime(ts) : "-";
}

export class TaskCommand implements SlashCommand {
  name = "task";
  description = "Manage sub-agent runs and project task graph nodes";

  async execute(args: string[], context: CommandContext): Promise<void> {
    const taskManager = context.taskManager;
    if (!taskManager) {
      console.log("Task manager not available.");
      return;
    }

    const action = (args[0] || "list").toLowerCase();

    if (action === "list") {
      const tasks = taskManager.list();
      if (tasks.length === 0) {
        console.log("No tasks.");
        return;
      }

      console.log(`\n${chalk.bold("Tasks:")}`);
      for (const task of tasks) {
        console.log(
          `  - ${task.id} [${task.status}] (${task.profile}) ${task.task.slice(0, 80)}`,
        );
      }
      console.log("");
      return;
    }

    if (action === "board") {
      const tasks = await taskManager.listTaskNodes();
      if (tasks.length === 0) {
        console.log("No task graph nodes.");
        return;
      }

      console.log(`\n${chalk.bold("Task Board:")}`);
      for (const task of tasks) {
        console.log(formatTaskNode(task));
      }
      console.log("");
      return;
    }

    if (action === "ready") {
      const targets = await taskManager.listDispatchTargets();
      if (targets.length === 0) {
        console.log("No ready or resumable task nodes.");
        return;
      }

      console.log(`\n${chalk.bold("Dispatchable Task Nodes:")}`);
      for (const target of targets) {
        console.log(formatDispatchTarget(target));
      }
      console.log("");
      return;
    }

    if (action === "scheduler") {
      const getSchedulerState = context.getTaskSchedulerState;
      if (!getSchedulerState) {
        console.log("Task scheduler state not available.");
        return;
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
      return;
    }

    if (action === "create") {
      const subject = args.slice(1).join(" ").trim();
      if (!subject) {
        console.log("Usage: /task create <subject>");
        return;
      }

      const task = await taskManager.createTaskNode({ subject });
      console.log(`Created task node #${task.id}: ${task.subject}`);
      return;
    }

    if (action === "show") {
      const rawTaskId = args[1];
      if (!rawTaskId || Number.isNaN(Number(rawTaskId))) {
        console.log("Usage: /task show <taskId>");
        return;
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
  lastRunAt: ${task.lastRunAt ? formatTime(task.lastRunAt) : "-"}
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
      return;
    }

    if (action === "thread") {
      const target = args[1]?.trim();
      if (!target) {
        console.log("Usage: /task thread <taskId|runId> [--pending]");
        return;
      }

      const messages = await taskManager.getTaskMailboxThread(target, {
        includeAcknowledged: !args.includes("--pending"),
      });
      if (messages.length === 0) {
        console.log(`No mailbox thread for ${target}.`);
        return;
      }

      console.log(`\n${chalk.bold(`Task Thread: ${target}`)}`);
      for (const message of messages) {
        for (const line of formatThreadMessage(message)) {
          console.log(line);
        }
      }
      console.log("");
      return;
    }

    if (action === "protocol") {
      const target = args[1]?.trim();
      if (!target) {
        console.log("Usage: /task protocol <taskId|runId>");
        return;
      }

      const rounds = await taskManager.getTaskProtocolView(target);
      if (rounds.length === 0) {
        console.log(`No protocol rounds for ${target}.`);
        return;
      }

      console.log(`\n${chalk.bold(`Task Protocol: ${target}`)}`);
      for (const round of rounds) {
        console.log(`  - Round ${round.index} [${round.waitingType}] ${round.waitingReason || "-"}`);
        console.log(`    request: ${formatProtocolMessage(round.request)}`);
        console.log(`    response: ${formatProtocolMessage(round.response)}`);
        console.log(`    outcome: ${round.outcome || "-"}`);
      }
      console.log("");
      return;
    }

    if (action === "history") {
      const target = args[1]?.trim();
      const events = taskManager.listTaskEvents(
        !target
          ? { limit: 20 }
          : /^\d+$/.test(target)
            ? { taskNodeId: Number(target), limit: 20 }
            : { taskRunId: target, limit: 20 },
      );

      if (events.length === 0) {
        console.log("No task history.");
        return;
      }

      console.log(`\n${chalk.bold("Task History:")}`);
      for (const event of events) {
        console.log(formatTaskEvent(event));
      }
      console.log("");
      return;
    }

    if (action === "claim") {
      const rawTaskId = args[1];
      if (!rawTaskId || Number.isNaN(Number(rawTaskId))) {
        console.log("Usage: /task claim <taskId> [owner]");
        return;
      }

      const owner = args[2]?.trim() || `cli:${context.session.getId()}`;
      const task = await taskManager.claimTaskNode(Number(rawTaskId), owner);
      console.log(`Claimed task node #${task.id} for ${task.owner}`);
      return;
    }

    if (action === "auto-claim") {
      const limit = args[1] && /^\d+$/.test(args[1]) ? Number(args[1]) : 1;
      const owner = (args[2] || "").trim() || undefined;
      const claimed = await taskManager.autoClaimTaskNodes({ limit, owner });
      if (claimed.length === 0) {
        console.log("No ready task nodes available to claim.");
        return;
      }

      console.log(`\n${chalk.bold("Claimed Task Nodes:")}`);
      for (const task of claimed) {
        console.log(formatTaskNode(task));
      }
      console.log("");
      return;
    }

    if (action === "execute-ready") {
      const runInBackground = args.includes("--background") || args.includes("-b");
      const filteredArgs = args.slice(1).filter((arg) => arg !== "--background" && arg !== "-b");
      const limit = filteredArgs[0] && /^\d+$/.test(filteredArgs[0]) ? Number(filteredArgs[0]) : 1;
      const profileArg = filteredArgs.find((arg) => PROFILES.includes(arg as TaskProfile));
      const profile = profileArg ? (profileArg as TaskProfile) : "general-purpose";

      const records = await taskManager.runReadyTaskNodes({
        limit,
        profile,
        runInBackground,
      });

      if (records.length === 0) {
        console.log("No ready or resumable task nodes were executed.");
        return;
      }

      if (runInBackground) {
        console.log(`Started ${records.length} ready task node(s) in background.`);
        return;
      }

      console.log(`\n${chalk.bold("Executed Ready Task Nodes:")}`);
      for (const record of records) {
        console.log(`  - ${record.id} task:#${record.taskNodeId} [${record.status}]`);
      }
      console.log("");
      return;
    }

    if (action === "cleanup") {
      const rawTaskId = args[1];
      if (!rawTaskId || Number.isNaN(Number(rawTaskId))) {
        console.log("Usage: /task cleanup <taskId>");
        return;
      }

      const result = await taskManager.cleanupTaskWorktree(Number(rawTaskId));
      if (!result.removed) {
        console.log(`No worktree to clean up for task node #${rawTaskId}.`);
        return;
      }

      console.log(`Removed worktree for task node #${rawTaskId}.`);
      return;
    }

    if (action === "run") {
      let profile: TaskProfile = "general-purpose";
      let offset = 1;
      if (args[1] && PROFILES.includes(args[1] as TaskProfile)) {
        profile = args[1] as TaskProfile;
        offset = 2;
      }

      const runInBackground = args.includes("--background") || args.includes("-b");
      const taskText = args
        .slice(offset)
        .filter((arg) => arg !== "--background" && arg !== "-b")
        .join(" ")
        .trim();

      if (!taskText) {
        console.log("Usage: /task run [profile] <task text> [--background]");
        return;
      }

      const task = await taskManager.start({
        task: taskText,
        profile,
        runInBackground,
      });

      if (runInBackground) {
        console.log(`Started background task: ${task.id}`);
        return;
      }

      if (task.status === "failed") {
        console.log(`Task failed: ${task.error || "unknown error"}`);
        return;
      }

      console.log(`\n${chalk.bold(`Task ${task.id} output:`)}\n${task.output || "(empty)"}\n`);
      return;
    }

    if (action === "execute") {
      const rawTaskId = args[1];
      if (!rawTaskId || Number.isNaN(Number(rawTaskId))) {
        console.log("Usage: /task execute <taskId> [profile] [--background]");
        return;
      }

      let profile: TaskProfile = "general-purpose";
      let offset = 2;
      if (args[2] && PROFILES.includes(args[2] as TaskProfile)) {
        profile = args[2] as TaskProfile;
        offset = 3;
      }

      const runInBackground = args.includes("--background") || args.includes("-b");
      const record = await taskManager.runTaskNode({
        taskId: Number(rawTaskId),
        profile,
        runInBackground,
      });

      if (runInBackground) {
        console.log(`Started task node #${rawTaskId} in background as ${record.id}`);
        return;
      }

      if (record.status === "failed") {
        console.log(`Task failed: ${record.error || "unknown error"}`);
        return;
      }

      console.log(`\n${chalk.bold(`Task node #${rawTaskId} output:`)}\n${record.output || "(empty)"}\n`);
      return;
    }

    if (action === "output") {
      const taskId = args[1];
      if (!taskId) {
        console.log("Usage: /task output <taskId|runId>");
        return;
      }

      const task = await taskManager.getTaskOutputView(taskId);
      if (!task) {
        console.log(`Task not found: ${taskId}`);
        return;
      }

      console.log(`
${chalk.bold(task.id)}
  source: ${task.source}
  profile: ${task.profile}
  status: ${task.status}
  taskNodeId: ${task.taskNodeId ?? "-"}
  mailboxId: ${task.mailboxId ?? "-"}
  waitingType: ${task.waitingType ?? "-"}
  created: ${formatTime(task.createdAt)}
  completed: ${task.completedAt ? formatTime(task.completedAt) : "-"}
`);

      if (task.status === "completed") {
        console.log(`${task.output || "(empty)"}\n`);
      } else if (task.status === "waiting") {
        console.log(`Waiting for input${task.waitingReason ? `: ${task.waitingReason}` : ""}`);
        if (task.output) {
          console.log(`${task.output}\n`);
        }
      } else if (task.status === "failed") {
        console.log(`Error: ${task.error || "unknown"}\n`);
      }
      return;
    }

    if (action === "resume") {
      const taskId = args[1];
      if (!taskId) {
        console.log("Usage: /task resume <taskId|runId>");
        return;
      }

      const resumed = await taskManager.resume(taskId);
      if (!resumed) {
        console.log(`Task not found: ${taskId}`);
        return;
      }

      if (resumed.status === "failed") {
        console.log(`Resumed task failed: ${resumed.error || "unknown error"}`);
        return;
      }

      console.log(`\n${chalk.bold(`Resumed task ${resumed.id} output:`)}\n${resumed.output || "(empty)"}\n`);
      return;
    }

    if (action === "answer") {
      const separatorIndex = args.indexOf("--");
      const target = args[1]?.trim();
      const answer = separatorIndex === -1 ? "" : args.slice(separatorIndex + 1).join(" ").trim();
      if (!target || !answer) {
        console.log("Usage: /task answer <taskId|runId> -- <message>");
        return;
      }

      const result = await taskManager.answerTask(target, answer);
      if (!result.resumed) {
        console.log(`Answer sent to ${result.mailboxId}, but the task was not resumed.`);
        return;
      }

      if (result.resumed.status === "waiting") {
        console.log(`Task is still waiting for input${result.resumed.waitingReason ? `: ${result.resumed.waitingReason}` : ""}`);
        return;
      }

      if (result.resumed.status === "failed") {
        console.log(`Resumed task failed: ${result.resumed.error || "unknown error"}`);
        return;
      }

      console.log(`\n${chalk.bold(`Answered ${target} and resumed ${result.resumed.id}:`)}\n${result.resumed.output || "(empty)"}\n`);
      return;
    }

    if (action === "approve") {
      const target = args[1]?.trim();
      const decision = (args[2] || "approve").trim().toLowerCase();
      const separatorIndex = args.indexOf("--");
      const note = separatorIndex === -1 ? "" : args.slice(separatorIndex + 1).join(" ").trim();
      if (!target || !["approve", "reject"].includes(decision)) {
        console.log("Usage: /task approve <taskId|runId> <approve|reject> [-- <note>]");
        return;
      }

      const result = await taskManager.approveTask(target, decision === "approve", note);
      if (!result.resumed) {
        console.log(`Approval sent to ${result.mailboxId}, but the task was not resumed.`);
        return;
      }

      if (result.resumed.status === "waiting") {
        console.log(`Task is still waiting for input${result.resumed.waitingReason ? `: ${result.resumed.waitingReason}` : ""}`);
        return;
      }

      if (result.resumed.status === "failed") {
        console.log(`Resumed task failed: ${result.resumed.error || "unknown error"}`);
        return;
      }

      console.log(`\n${chalk.bold(`${decision === "approve" ? "Approved" : "Rejected"} ${target} and resumed ${result.resumed.id}:`)}\n${result.resumed.output || "(empty)"}\n`);
      return;
    }

    console.log(
      "Usage: /task [list|board|ready|scheduler|create <subject>|show <id>|history [taskId|runId]|thread <taskId|runId> [--pending]|protocol <taskId|runId>|claim <id> [owner]|auto-claim [limit] [owner]|run|execute <id>|execute-ready [limit] [profile] [--background]|cleanup <id>|output <taskId|runId>|resume <taskId|runId>|answer <taskId|runId> -- <message>|approve <taskId|runId> <approve|reject> [-- <note>]]",
    );
  }
}
