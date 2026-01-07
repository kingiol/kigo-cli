/**
 * MCP commands
 */

import { Command } from 'commander';
import * as yaml from 'js-yaml';
import { getConfigManager } from '../config/ConfigManager.js';
import type { MCPServerConfig } from '../config/configSchema.js';

export function mcpCommands(program: Command): void {
  const mcpCmd = program.command('mcp').description('Manage MCP servers');

  mcpCmd
    .command('add <name> <command_or_url>')
    .option('-e, --env <vars>', 'Environment variables (KEY=VALUE)', '')
    .option('--transport <type>', 'Transport type (stdio, sse, http)', 'stdio')
    .option('--url <url>', 'URL for SSE/HTTP transport')
    .action(async (name, commandOrUrl, options) => {
      const manager = getConfigManager();
      const config = await manager.load();

      const envVars: Record<string, string> = {};
      if (options.env) {
        for (const pair of options.env.split(',')) {
          const [key, value] = pair.split('=');
          if (key && value) {
            envVars[key] = value;
          }
        }
      }

      let command: string | undefined;
      let url: string | undefined;

      if (options.transport === 'stdio') {
        command = commandOrUrl;
        url = options.url;
      } else {
        command = undefined;
        url = options.url || commandOrUrl;
      }

      const serverConfig: MCPServerConfig = {
        name,
        transportType: options.transport as 'stdio' | 'sse' | 'http',
        args: [],
        envVars,
        headers: {},
        cacheToolsList: true,
        command,
        url,
      };

      config.mcpServers.push(serverConfig);
      await manager.save(config);
      console.log(`Added MCP server: ${name}`);
    });

  mcpCmd
    .command('list')
    .description('List MCP servers')
    .action(async () => {
      const manager = getConfigManager();
      const config = await manager.load();

      if (config.mcpServers.length === 0) {
        console.log('No MCP servers configured');
        return;
      }

      console.log('MCP servers:');
      for (const server of config.mcpServers) {
        console.log(`  - ${server.name} (${server.transportType})`);
      }
    });

  mcpCmd
    .command('get <name>')
    .description('Show MCP server details')
    .action(async (name) => {
      const manager = getConfigManager();
      const config = await manager.load();

      const server = config.mcpServers.find(s => s.name === name);
      if (!server) {
        console.log(`MCP server not found: ${name}`);
        return;
      }

      console.log(yaml.dump(server, { indent: 2 }));
    });

  mcpCmd
    .command('remove <name>')
    .description('Remove MCP server')
    .action(async (name) => {
      const manager = getConfigManager();
      const config = await manager.load();

      const index = config.mcpServers.findIndex(s => s.name === name);
      if (index === -1) {
        console.log(`MCP server not found: ${name}`);
        return;
      }

      config.mcpServers.splice(index, 1);
      await manager.save(config);
      console.log(`Removed MCP server: ${name}`);
    });
}