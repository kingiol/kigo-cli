#!/usr/bin/env node
/**
 * Main CLI entry point
 */

import { Command } from 'commander';
import { getConfigManager } from './config/ConfigManager.js';
import { runInteractive } from './interactive.js';
import { configCommands } from './commands/config.js';
import { authCommands } from './commands/auth.js';
import { mcpCommands } from './commands/mcp.js';

const program = new Command();

program
  .name('kigo')
  .description('AI coding assistant for the terminal')
  .version('0.1.0');

// Main command - run interactive or single prompt
program
  .argument('[prompt...]', 'Prompt to send to the AI')
  .option('-s, --session <name>', 'Session name')
  .option('--no-stream', 'Disable streaming output')
  .option('-m, --model <model>', 'Model to use')
  .action(async (prompt: string[] | undefined, options) => {
    const configManager = getConfigManager();
    await configManager.load();

    if (prompt && prompt.length > 0) {
      // Single prompt mode
      const fullPrompt = prompt.join(' ');
      console.log('Single prompt mode:', fullPrompt);
      // TODO: Implement single prompt execution
    } else {
      // Interactive mode
      await runInteractive(configManager, options);
    }
  });

// Add subcommands
configCommands(program);
authCommands(program);
mcpCommands(program);

program.parse();