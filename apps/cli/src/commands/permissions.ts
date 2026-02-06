import { Command } from "commander";
import { getConfigManager } from "../config/ConfigManager.js";

export function permissionsCommands(program: Command): void {
  const cmd = program.command("permissions").description("Manage tool permissions");

  cmd
    .command("show")
    .description("Show permissions configuration")
    .action(async () => {
      const manager = getConfigManager();
      const config = await manager.load();
      console.log(JSON.stringify(config.permissions, null, 2));
    });

  cmd
    .command("allow <rule>")
    .description("Add an allow rule, e.g. Bash(npm run build) or read_*")
    .action(async (rule) => {
      const manager = getConfigManager();
      const config = await manager.load();
      if (!config.permissions.allow.includes(rule)) {
        config.permissions.allow.push(rule);
        await manager.save(config);
      }
      console.log(`Added allow rule: ${rule}`);
    });

  cmd
    .command("block <rule>")
    .description("Add a block rule")
    .action(async (rule) => {
      const manager = getConfigManager();
      const config = await manager.load();
      if (!config.permissions.block.includes(rule)) {
        config.permissions.block.push(rule);
        await manager.save(config);
      }
      console.log(`Added block rule: ${rule}`);
    });

  cmd
    .command("unallow <rule>")
    .description("Remove an allow rule")
    .action(async (rule) => {
      const manager = getConfigManager();
      const config = await manager.load();
      const idx = config.permissions.allow.indexOf(rule);
      if (idx >= 0) {
        config.permissions.allow.splice(idx, 1);
        await manager.save(config);
      }
      console.log(`Removed allow rule: ${rule}`);
    });

  cmd
    .command("unblock <rule>")
    .description("Remove a block rule")
    .action(async (rule) => {
      const manager = getConfigManager();
      const config = await manager.load();
      const idx = config.permissions.block.indexOf(rule);
      if (idx >= 0) {
        config.permissions.block.splice(idx, 1);
        await manager.save(config);
      }
      console.log(`Removed block rule: ${rule}`);
    });

  cmd
    .command("dont-ask <value>")
    .description("Set dontAsk mode to true or false")
    .action(async (value) => {
      const manager = getConfigManager();
      const config = await manager.load();
      config.permissions.dontAsk = ["true", "1", "yes", "on"].includes(
        String(value).toLowerCase(),
      );
      await manager.save(config);
      console.log(`permissions.dontAsk = ${config.permissions.dontAsk}`);
    });
}
