
import chalk from 'chalk';
import { SlashCommand, type ExitCommandContext } from '../types.js';

export class ExitCommand implements SlashCommand {
    name = 'exit';
    description = 'Exit Kigo';

    async execute(_args: string[], context: ExitCommandContext): Promise<void> {
        console.log(chalk.yellow('Goodbye!'));
        if (context.cleanup) {
            await context.cleanup();
        }
        process.exit(0);
    }
}
