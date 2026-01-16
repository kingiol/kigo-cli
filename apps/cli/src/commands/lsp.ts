/**
 * LSP server command
 */

import { Command } from 'commander';
import { startLspServer } from '@kigo/lsp';

export function lspCommands(program: Command): void {
  program
    .command('lsp')
    .description('Start the Kigo LSP server (stdio)')
    .action(() => {
      startLspServer();
    });
}
