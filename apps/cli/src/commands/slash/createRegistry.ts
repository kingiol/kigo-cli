import { AgentCommand } from "./definitions/AgentCommand.js";
import { ClearCommand } from "./definitions/ClearCommand.js";
import { ConfigCommand } from "./definitions/ConfigCommand.js";
import { ExitCommand } from "./definitions/ExitCommand.js";
import { HelpCommand } from "./definitions/HelpCommand.js";
import { MailCommand } from "./definitions/MailCommand.js";
import { PermissionsCommand } from "./definitions/PermissionsCommand.js";
import { PlanCommand } from "./definitions/PlanCommand.js";
import { SessionCommand } from "./definitions/SessionCommand.js";
import { StatusCommand } from "./definitions/StatusCommand.js";
import { TaskCommand } from "./definitions/TaskCommand.js";
import { ToolsCommand } from "./definitions/ToolsCommand.js";
import { SlashCommandRegistry } from "./Registry.js";

export function createSlashCommandRegistry(): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  registry.register(new HelpCommand());
  registry.register(new ClearCommand());
  registry.register(new StatusCommand());
  registry.register(new ExitCommand());
  registry.register(new ConfigCommand());
  registry.register(new SessionCommand());
  registry.register(new PermissionsCommand());
  registry.register(new TaskCommand());
  registry.register(new PlanCommand());
  registry.register(new AgentCommand());
  registry.register(new ToolsCommand());
  registry.register(new MailCommand());
  return registry;
}
