
import chalk from 'chalk';
import { SlashCommand, CommandContext } from '../types.js';
import { SessionUsage } from '../../../display/StatusLine.js';

export class StatusCommand implements SlashCommand {
    name = 'status';
    description = 'Show session status';

    async execute(_args: string[], context: CommandContext): Promise<void> {
        const usage: SessionUsage = context.session.getUsage() as SessionUsage;
        const modelName = context.configManager.getModelName();
        const provider = context.configManager.getProvider();
        const sessionId = context.session.getId();

        console.log(`
${chalk.bold('Session Status:')}
  ID: ${sessionId}
  Model: ${modelName}
  Provider: ${provider}
  Messages: ${context.agent.getMessages().length}
  Input Tokens: ${usage.inputTokens}
  Output Tokens: ${usage.outputTokens}
  Total Cost: $${usage.totalCost.toFixed(4)}
`);
    }
}
