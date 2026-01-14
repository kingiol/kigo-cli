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
import { readFileSync } from 'fs';

// Suppress punycode deprecation warning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  const w = warning as any;
  if (warning.name === 'DeprecationWarning' && (w.code === 'DEP0169' || w.code === 'DEP0040')) {
    return;
  }
  // Print other warnings to stderr (default behavior)
  console.warn(warning);
});

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
      await runInteractive(configManager, {
        ...options,
        version: pkg.version
      });
    }
  });

// Add subcommands
configCommands(program);
authCommands(program);
mcpCommands(program);

program.parse();