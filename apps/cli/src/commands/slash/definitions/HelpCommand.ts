
import chalk from 'chalk';
import { SlashCommand, CommandContext } from '../types.js';

export class HelpCommand implements SlashCommand {
    name = 'help';
    description = 'Show this help';

    async execute(_args: string[], context: CommandContext): Promise<void> {
        const commands = context.registry.getAll();
        console.log(`\n${chalk.bold('Available commands:')}`);
        for (const cmd of commands) {
            console.log(`  /${cmd.name.padEnd(10)} - ${cmd.description}`);
        }
        console.log('');
    }
}
