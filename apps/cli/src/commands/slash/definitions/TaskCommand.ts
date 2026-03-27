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
      const tasks = await taskManager.listTaskNodes({ readyOnly: true });
      if (tasks.length === 0) {
        console.log("No ready task nodes.");
        return;
      }

      console.log(`\n${chalk.bold("Ready Task Nodes:")}`);
      for (const task of tasks) {
        console.log(formatTaskNode(task));
      }
      console.log("");
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
      console.log(`
${chalk.bold(`#${task.id}`)}
  status: ${task.status}
  owner: ${task.owner || "-"}
  blockedBy: ${task.blockedBy.length ? task.blockedBy.join(", ") : "-"}
  blocks: ${task.blocks.length ? task.blocks.join(", ") : "-"}
  lastRunId: ${task.lastRunId || "-"}
  lastRunStatus: ${task.lastRunStatus || "-"}
  lastRunAt: ${task.lastRunAt ? formatTime(task.lastRunAt) : "-"}
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
  created: ${formatTime(task.createdAt)}
  completed: ${task.completedAt ? formatTime(task.completedAt) : "-"}
`);

      if (task.status === "completed") {
        console.log(`${task.output || "(empty)"}\n`);
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

    console.log(
      "Usage: /task [list|board|ready|create <subject>|show <id>|history [taskId|runId]|claim <id> [owner]|run|execute <id>|output <taskId|runId>|resume <taskId|runId>]",
    );
  }
}
