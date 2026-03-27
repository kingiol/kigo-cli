import { SlashCommand, type TaskCommandContext } from "../types.js";
import { handleTaskAction } from "./task/handlers.js";
import { TASK_COMMAND_USAGE } from "./task/shared.js";

export class TaskCommand implements SlashCommand {
  name = "task";
  description = "Manage sub-agent runs and project task graph nodes";

  async execute(args: string[], context: TaskCommandContext): Promise<void> {
    const action = (args[0] || "list").toLowerCase();
    const handled = await handleTaskAction(action, args, context);
    if (!handled) {
      console.log(TASK_COMMAND_USAGE);
    }
  }
}
