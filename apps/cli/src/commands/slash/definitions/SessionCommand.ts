
import chalk from 'chalk';
import { SlashCommand, type SessionCommandContext } from '../types.js';

export class SessionCommand implements SlashCommand {
    name = 'session';
    description = 'Show session info';

    async execute(_args: string[], context: SessionCommandContext): Promise<void> {
        const sessions = await context.session.listSessions();
        console.log(`
${chalk.bold('Sessions:')}
${sessions.map((s: { title: string | null; id: string; updatedAt: number | string | Date }) => `  - ${s.title || s.id} (${new Date(s.updatedAt).toLocaleString()})`).join('\n')}
`);
    }
}
