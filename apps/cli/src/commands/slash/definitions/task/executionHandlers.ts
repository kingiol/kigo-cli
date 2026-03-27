import chalk from "chalk";
import type { TaskProfile } from "@kigo/tools";
import type { TaskCommandContext } from "../../types.js";
import { formatTaskNode } from "./formatters.js";
import { isNumericId, isTaskProfile } from "./shared.js";

export async function handleTaskExecutionAction(
  action: string,
  args: string[],
  context: TaskCommandContext,
): Promise<boolean> {
  const taskManager = context.taskManager;
  if (!taskManager) {
    console.log("Task manager not available.");
    return true;
  }

  if (action === "create") {
    const subject = args.slice(1).join(" ").trim();
    if (!subject) {
      console.log("Usage: /task create <subject>");
      return true;
    }

    const task = await taskManager.createTaskNode({ subject });
    console.log(`Created task node #${task.id}: ${task.subject}`);
    return true;
  }

  if (action === "claim") {
    const rawTaskId = args[1];
    if (!isNumericId(rawTaskId)) {
      console.log("Usage: /task claim <taskId> [owner]");
      return true;
    }

    const owner = args[2]?.trim() || `cli:${context.session.getId()}`;
    const task = await taskManager.claimTaskNode(Number(rawTaskId), owner);
    console.log(`Claimed task node #${task.id} for ${task.owner}`);
    return true;
  }

  if (action === "auto-claim") {
    const limit = isNumericId(args[1]) ? Number(args[1]) : 1;
    const owner = (args[2] || "").trim() || undefined;
    const claimed = await taskManager.autoClaimTaskNodes({ limit, owner });
    if (claimed.length === 0) {
      console.log("No ready task nodes available to claim.");
      return true;
    }

    console.log(`\n${chalk.bold("Claimed Task Nodes:")}`);
    for (const task of claimed) {
      console.log(formatTaskNode(task));
    }
    console.log("");
    return true;
  }

  if (action === "execute-ready") {
    const runInBackground = args.includes("--background") || args.includes("-b");
    const filteredArgs = args.slice(1).filter((arg) => arg !== "--background" && arg !== "-b");
    const limit = isNumericId(filteredArgs[0]) ? Number(filteredArgs[0]) : 1;
    const profileArg = filteredArgs.find((arg) => isTaskProfile(arg));
    const profile = profileArg || "general-purpose";

    const records = await taskManager.runReadyTaskNodes({
      limit,
      profile,
      runInBackground,
    });

    if (records.length === 0) {
      console.log("No ready or resumable task nodes were executed.");
      return true;
    }

    if (runInBackground) {
      console.log(`Started ${records.length} ready task node(s) in background.`);
      return true;
    }

    console.log(`\n${chalk.bold("Executed Ready Task Nodes:")}`);
    for (const record of records) {
      console.log(`  - ${record.id} task:#${record.taskNodeId} [${record.status}]`);
    }
    console.log("");
    return true;
  }

  if (action === "cleanup") {
    const rawTaskId = args[1];
    if (!isNumericId(rawTaskId)) {
      console.log("Usage: /task cleanup <taskId>");
      return true;
    }

    const result = await taskManager.cleanupTaskWorktree(Number(rawTaskId));
    if (!result.removed) {
      console.log(`No worktree to clean up for task node #${rawTaskId}.`);
      return true;
    }

    console.log(`Removed worktree for task node #${rawTaskId}.`);
    return true;
  }

  if (action === "run") {
    let profile: TaskProfile = "general-purpose";
    let offset = 1;
    if (isTaskProfile(args[1])) {
      profile = args[1];
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
      return true;
    }

    const task = await taskManager.start({
      task: taskText,
      profile,
      runInBackground,
    });

    if (runInBackground) {
      console.log(`Started background task: ${task.id}`);
      return true;
    }

    if (task.status === "failed") {
      console.log(`Task failed: ${task.error || "unknown error"}`);
      return true;
    }

    console.log(`\n${chalk.bold(`Task ${task.id} output:`)}\n${task.output || "(empty)"}\n`);
    return true;
  }

  if (action === "execute") {
    const rawTaskId = args[1];
    if (!isNumericId(rawTaskId)) {
      console.log("Usage: /task execute <taskId> [profile] [--background]");
      return true;
    }

    let profile: TaskProfile = "general-purpose";
    if (isTaskProfile(args[2])) {
      profile = args[2];
    }

    const runInBackground = args.includes("--background") || args.includes("-b");
    const record = await taskManager.runTaskNode({
      taskId: Number(rawTaskId),
      profile,
      runInBackground,
    });

    if (runInBackground) {
      console.log(`Started task node #${rawTaskId} in background as ${record.id}`);
      return true;
    }

    if (record.status === "failed") {
      console.log(`Task failed: ${record.error || "unknown error"}`);
      return true;
    }

    console.log(`\n${chalk.bold(`Task node #${rawTaskId} output:`)}\n${record.output || "(empty)"}\n`);
    return true;
  }

  return false;
}
