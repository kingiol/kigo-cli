
import chalk from 'chalk';
import { SlashCommand, CommandContext } from '../types.js';

export class ClearCommand implements SlashCommand {
    name = 'clear';
    description = 'Clear conversation history';

    async execute(_args: string[], context: CommandContext): Promise<void> {
        context.agent.reset();
        context.session.reset();
        console.log(chalk.green('Conversation cleared'));
    }
}
