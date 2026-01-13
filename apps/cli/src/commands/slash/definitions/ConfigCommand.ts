
import chalk from 'chalk';
import { SlashCommand, CommandContext } from '../types.js';

export class ConfigCommand implements SlashCommand {
    name = 'config';
    description = 'Show configuration';

    async execute(_args: string[], context: CommandContext): Promise<void> {
        const config = await context.configManager.load();
        console.log(`
${chalk.bold('Configuration:')}
  Model: ${config.model.name}
  Provider: ${config.model.provider}
  Stream: ${config.cli.stream}
  MCP Servers: ${config.mcpServers.length}
  Skills: ${config.skills.enabled ? 'enabled' : 'disabled'}
`);
    }
}
