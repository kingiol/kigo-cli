import chalk from "chalk";
import type { TaskCommandContext } from "../../types.js";

export async function handleTaskInteractionAction(
  action: string,
  args: string[],
  context: TaskCommandContext,
): Promise<boolean> {
  const taskManager = context.taskManager;
  if (!taskManager) {
    console.log("Task manager not available.");
    return true;
  }

  if (action === "output") {
    const taskId = args[1];
    if (!taskId) {
      console.log("Usage: /task output <taskId|runId>");
      return true;
    }

    const task = await taskManager.getTaskOutputView(taskId);
    if (!task) {
      console.log(`Task not found: ${taskId}`);
      return true;
    }

    console.log(`
${chalk.bold(task.id)}
  source: ${task.source}
  profile: ${task.profile}
  status: ${task.status}
  taskNodeId: ${task.taskNodeId ?? "-"}
  mailboxId: ${task.mailboxId ?? "-"}
  waitingType: ${task.waitingType ?? "-"}
  created: ${new Date(task.createdAt).toLocaleTimeString()}
  completed: ${task.completedAt ? new Date(task.completedAt).toLocaleTimeString() : "-"}
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
    return true;
  }

  if (action === "resume") {
    const taskId = args[1];
    if (!taskId) {
      console.log("Usage: /task resume <taskId|runId>");
      return true;
    }

    const resumed = await taskManager.resume(taskId);
    if (!resumed) {
      console.log(`Task not found: ${taskId}`);
      return true;
    }

    if (resumed.status === "failed") {
      console.log(`Resumed task failed: ${resumed.error || "unknown error"}`);
      return true;
    }

    console.log(`\n${chalk.bold(`Resumed task ${resumed.id} output:`)}\n${resumed.output || "(empty)"}\n`);
    return true;
  }

  if (action === "answer") {
    const separatorIndex = args.indexOf("--");
    const target = args[1]?.trim();
    const answer = separatorIndex === -1 ? "" : args.slice(separatorIndex + 1).join(" ").trim();
    if (!target || !answer) {
      console.log("Usage: /task answer <taskId|runId> -- <message>");
      return true;
    }

    const result = await taskManager.answerTask(target, answer);
    if (!result.resumed) {
      console.log(`Answer sent to ${result.mailboxId}, but the task was not resumed.`);
      return true;
    }

    if (result.resumed.status === "waiting") {
      console.log(`Task is still waiting for input${result.resumed.waitingReason ? `: ${result.resumed.waitingReason}` : ""}`);
      return true;
    }

    if (result.resumed.status === "failed") {
      console.log(`Resumed task failed: ${result.resumed.error || "unknown error"}`);
      return true;
    }

    console.log(`\n${chalk.bold(`Answered ${target} and resumed ${result.resumed.id}:`)}\n${result.resumed.output || "(empty)"}\n`);
    return true;
  }

  if (action === "approve") {
    const target = args[1]?.trim();
    const decision = (args[2] || "approve").trim().toLowerCase();
    const separatorIndex = args.indexOf("--");
    const note = separatorIndex === -1 ? "" : args.slice(separatorIndex + 1).join(" ").trim();
    if (!target || !["approve", "reject"].includes(decision)) {
      console.log("Usage: /task approve <taskId|runId> <approve|reject> [-- <note>]");
      return true;
    }

    const result = await taskManager.approveTask(target, decision === "approve", note);
    if (!result.resumed) {
      console.log(`Approval sent to ${result.mailboxId}, but the task was not resumed.`);
      return true;
    }

    if (result.resumed.status === "waiting") {
      console.log(`Task is still waiting for input${result.resumed.waitingReason ? `: ${result.resumed.waitingReason}` : ""}`);
      return true;
    }

    if (result.resumed.status === "failed") {
      console.log(`Resumed task failed: ${result.resumed.error || "unknown error"}`);
      return true;
    }

    console.log(`\n${chalk.bold(`${decision === "approve" ? "Approved" : "Rejected"} ${target} and resumed ${result.resumed.id}:`)}\n${result.resumed.output || "(empty)"}\n`);
    return true;
  }

  return false;
}
