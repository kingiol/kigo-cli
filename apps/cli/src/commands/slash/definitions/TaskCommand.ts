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

export class TaskCommand implements SlashCommand {
  name = "task";
  description = "Manage sub-agent tasks";

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

    if (action === "output") {
      const taskId = args[1];
      if (!taskId) {
        console.log("Usage: /task output <taskId>");
        return;
      }

      const task = taskManager.get(taskId);
      if (!task) {
        console.log(`Task not found: ${taskId}`);
        return;
      }

      console.log(`
${chalk.bold(task.id)}
  profile: ${task.profile}
  status: ${task.status}
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
        console.log("Usage: /task resume <taskId>");
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

    console.log("Usage: /task [list|run|output|resume]");
  }
}
