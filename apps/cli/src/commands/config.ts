/**
 * Config commands
 */

import { Command } from "commander";
import { getConfigManager } from "../config/ConfigManager.js";
import * as yaml from "js-yaml";

export function configCommands(program: Command): void {
  const configCmd = program
    .command("config")
    .description("Manage configuration");

  configCmd
    .command("show")
    .description("Show current configuration")
    .action(async () => {
      const manager = getConfigManager();
      const config = await manager.load();
      console.log(yaml.dump(config, { indent: 2, lineWidth: 120 }));
    });

  configCmd
    .command("path")
    .description("Show config file path")
    .action(async () => {
      const manager = getConfigManager();
      console.log("Config file:", manager.getPath());
    });

  configCmd
    .command("edit")
    .description("Open config in editor")
    .action(async () => {
      const editor = process.env.EDITOR || "vi";
      const manager = getConfigManager();
      const { spawn } = await import("node:child_process");
      spawn(editor, [manager.getPath()], { stdio: "inherit" });
    });

  configCmd
    .command("init")
    .description("Initialize config with defaults")
    .action(async () => {
      const manager = getConfigManager();
      await manager.save({
        model: { name: "gpt-4o", provider: "openai" },
        cli: { stream: true },
        mcpServers: [],
        skills: {
          enabled: true,
          projectSkillsDir: ".koder/skills",
          userSkillsDir: "~/.koder/skills",
        },
      });
      console.log("Config initialized at:", manager.getPath());
    });

  configCmd
    .command("set <key> <value>")
    .description("Set a config value (e.g., model.name gpt-4o)")
    .action(async (key, value) => {
      const manager = getConfigManager();
      const config = await manager.load();

      // Parse nested key (e.g., "model.name")
      const keys = key.split(".");
      let current: any = config;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      // Try to parse value as JSON, fallback to string
      try {
        current[keys[keys.length - 1]] = JSON.parse(value);
      } catch {
        current[keys[keys.length - 1]] = value;
      }

      await manager.save(config);
      console.log(`Set ${key} = ${value}`);
    });
}
