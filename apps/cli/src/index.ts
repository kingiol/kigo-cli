#!/usr/bin/env node
/**
 * Main CLI entry point
 */

import { Command } from 'commander';
import { getConfigManager } from './config/ConfigManager.js';
import { runInteractiveWithUI } from './ui/index.js';
import { configCommands } from './commands/config.js';
import { authCommands } from './commands/auth.js';
import { mcpCommands } from './commands/mcp.js';
import { lspCommands } from './commands/lsp.js';
import { readFileSync } from 'fs';

const program = new Command();

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

program
  .name('kigo')
  .description('AI coding assistant for the terminal')
  .version(pkg.version);

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
      await runInteractiveWithUI(configManager, {
        ...options,
        version: pkg.version
      });
    }
  });

// Add subcommands
configCommands(program);
authCommands(program);
mcpCommands(program);
lspCommands(program);

program.parse();
