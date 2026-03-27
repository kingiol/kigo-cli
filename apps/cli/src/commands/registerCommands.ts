import type { Command } from "commander";
import { authCommands } from "./auth.js";
import { configCommands } from "./config.js";
import { doctorCommands } from "./doctor.js";
import { lspCommands } from "./lsp.js";
import { mcpCommands } from "./mcp.js";
import { permissionsCommands } from "./permissions.js";
import { pluginCommands } from "./plugin.js";

export function registerCliCommands(program: Command): void {
  configCommands(program);
  authCommands(program);
  mcpCommands(program);
  lspCommands(program);
  permissionsCommands(program);
  pluginCommands(program);
  doctorCommands(program);
}
