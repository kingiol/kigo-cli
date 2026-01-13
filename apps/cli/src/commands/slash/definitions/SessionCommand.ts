
import chalk from 'chalk';
import { SlashCommand, CommandContext } from '../types.js';

export class SessionCommand implements SlashCommand {
    name = 'session';
    description = 'Show session info';

    async execute(_args: string[], context: CommandContext): Promise<void> {
        const sessions = await context.session.listSessions();
        console.log(`
${chalk.bold('Sessions:')}
${sessions.map((s: { title: string | null; id: string; updatedAt: number | string | Date }) => `  - ${s.title || s.id} (${new Date(s.updatedAt).toLocaleString()})`).join('\n')}
`);
    }
}
