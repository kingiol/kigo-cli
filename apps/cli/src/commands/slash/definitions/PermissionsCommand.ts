import chalk from "chalk";
import { SlashCommand, CommandContext } from "../types.js";

export class PermissionsCommand implements SlashCommand {
  name = "permissions";
  description = "Show or manage permission runtime rules";

  async execute(args: string[], context: CommandContext): Promise<void> {
    const controller = context.permissionController;
    if (!controller) {
      console.log("Permissions controller not available.");
      return;
    }

    const action = (args[0] || "show").toLowerCase();

    if (action === "show") {
      const cfg = controller.getConfig();
      console.log(`
${chalk.bold("Permissions:")}
  dontAsk: ${cfg.dontAsk}
  allow: ${cfg.allow.length ? cfg.allow.join(", ") : "(empty)"}
  block: ${cfg.block.length ? cfg.block.join(", ") : "(empty)"}
  auditLogPath: ${cfg.auditLogPath}
`);
      return;
    }

    if (action === "allow-once") {
      const rule = args.slice(1).join(" ").trim();
      if (!rule) {
        console.log("Usage: /permissions allow-once <rule>");
        return;
      }
      controller.allowOnce(rule);
      console.log(`Added temporary allow rule: ${rule}`);
      return;
    }

    console.log("Usage: /permissions [show|allow-once <rule>]");
  }
}
