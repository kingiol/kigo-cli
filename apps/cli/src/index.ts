#!/usr/bin/env node
/**
 * Main CLI entry point
 */

import { Command } from 'commander';
import { getConfigManager } from './config/ConfigManager.js';
import { runInteractiveWithUI } from './ui/index.js';
import { createInteractiveRuntime } from './interactive/runtime.js';
import { configCommands } from './commands/config.js';
import { authCommands } from './commands/auth.js';
import { mcpCommands } from './commands/mcp.js';
import { lspCommands } from './commands/lsp.js';
import { permissionsCommands } from './commands/permissions.js';
import { pluginCommands } from './commands/plugin.js';
import { doctorCommands } from './commands/doctor.js';
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
      const fullPrompt = prompt.join(' ');
      const runtime = await createInteractiveRuntime(configManager, {
        ...options,
        version: pkg.version,
      });
      let pendingLine = '';

      try {
        await runtime.runInput(fullPrompt, (event) => {
          if (event.type === 'text_delta') {
            pendingLine += event.data;
            process.stdout.write(event.data);
            return;
          }

          if (event.type === 'tool_call') {
            if (pendingLine.length > 0) {
              process.stdout.write('\n');
              pendingLine = '';
            }
            process.stdout.write(`\n[tool] ${event.toolName || event.data?.name || 'unknown'}\n`);
            return;
          }

          if (event.type === 'tool_output') {
            if (pendingLine.length > 0) {
              process.stdout.write('\n');
              pendingLine = '';
            }
            const payload = event.data?.error ? `Error: ${event.data.error}` : (event.data?.result || '');
            if (payload) {
              process.stdout.write(`${payload}\n`);
            }
            return;
          }

          if (event.type === 'error') {
            if (pendingLine.length > 0) {
              process.stdout.write('\n');
              pendingLine = '';
            }
            process.stderr.write(`Error: ${event.data}\n`);
          }
        });
        if (pendingLine.length > 0) {
          process.stdout.write('\n');
        }
      } finally {
        await runtime.close();
      }
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
permissionsCommands(program);
pluginCommands(program);
doctorCommands(program);

program.parse();
