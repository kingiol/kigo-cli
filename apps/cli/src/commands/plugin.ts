import { Command } from "commander";
import { getConfigManager } from "../config/ConfigManager.js";

export function pluginCommands(program: Command): void {
  const pluginCmd = program.command("plugin").description("Manage plugins");

  pluginCmd
    .command("list")
    .description("List configured plugins")
    .action(async () => {
      const manager = getConfigManager();
      await manager.load();
      const plugins = manager.getPlugins();
      if (plugins.length === 0) {
        console.log("No plugins configured");
        return;
      }
      console.log("Configured plugins:");
      for (const plugin of plugins) {
        const state = plugin.enabled ? "enabled" : "disabled";
        console.log(`  - ${plugin.name} [${plugin.source}] (${state}) -> ${plugin.spec}`);
      }
    });

  pluginCmd
    .command("add <spec>")
    .description("Add a plugin from npm package or file path")
    .option("--source <source>", "Plugin source: npm|file", "npm")
    .option("--name <name>", "Plugin name")
    .action(async (spec, options) => {
      const source = options.source === "file" ? "file" : "npm";
      const name = options.name || (source === "file" ? spec.split("/").pop() : spec);
      const manager = getConfigManager();
      await manager.load();
      await manager.addPlugin({
        name,
        source,
        spec,
        enabled: true,
        options: {},
      });
      console.log(`Added plugin: ${name} (${source})`);
    });

  pluginCmd
    .command("remove <nameOrSpec>")
    .description("Remove plugin by name or spec")
    .action(async (nameOrSpec) => {
      const manager = getConfigManager();
      await manager.load();
      const ok = await manager.removePlugin(nameOrSpec);
      if (!ok) {
        console.log(`Plugin not found: ${nameOrSpec}`);
        return;
      }
      console.log(`Removed plugin: ${nameOrSpec}`);
    });
}
