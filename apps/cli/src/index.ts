#!/usr/bin/env node
/**
 * Main CLI entry point
 */

import { Command } from "commander";
import { runSinglePrompt } from "./cli/runSinglePrompt.js";
import { getProgramMetadata } from "./cli/programMetadata.js";
import { registerCliCommands } from "./commands/registerCommands.js";
import { getConfigManager } from "./config/ConfigManager.js";
import { runInteractiveWithUI } from "./ui/index.js";

const program = new Command();
const pkg = getProgramMetadata();

program
  .name("kigo")
  .description("AI coding assistant for the terminal")
  .version(pkg.version);

program
  .argument("[prompt...]", "Prompt to send to the AI")
  .option("-s, --session <name>", "Session name")
  .option("--no-stream", "Disable streaming output")
  .option("-m, --model <model>", "Model to use")
  .action(async (prompt: string[] | undefined, options) => {
    if (prompt && prompt.length > 0) {
      await runSinglePrompt(prompt.join(" "), {
        ...options,
        version: pkg.version,
      });
      return;
    }

    const configManager = getConfigManager();
    await configManager.load();

    await runInteractiveWithUI(configManager, {
      ...options,
      version: pkg.version,
    });
  });

registerCliCommands(program);

program.parse();
