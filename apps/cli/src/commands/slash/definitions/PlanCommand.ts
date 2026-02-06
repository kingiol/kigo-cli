import { SlashCommand, CommandContext } from "../types.js";

export class PlanCommand implements SlashCommand {
  name = "plan";
  description = "Toggle or inspect plan mode (read-only tools)";

  async execute(args: string[], context: CommandContext): Promise<void> {
    const getState = context.isPlanModeEnabled;
    const setState = context.setPlanModeEnabled;

    if (!getState || !setState) {
      console.log("Plan mode runtime controls not available.");
      return;
    }

    const action = (args[0] || "status").toLowerCase();

    if (action === "status") {
      console.log(`Plan mode: ${getState() ? "enabled" : "disabled"}`);
      return;
    }

    if (action === "on" || action === "enter") {
      setState(true);
      console.log("Plan mode enabled. Only read-only tools are allowed.");
      return;
    }

    if (action === "off" || action === "exit") {
      setState(false);
      console.log("Plan mode disabled. All permitted tools are available.");
      return;
    }

    console.log("Usage: /plan [status|on|off]");
  }
}
