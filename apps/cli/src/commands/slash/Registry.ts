
import { SlashCommand, CommandContext, ISlashCommandRegistry } from './types.js';

export class SlashCommandRegistry implements ISlashCommandRegistry {
    private commands: Map<string, SlashCommand> = new Map();

    register(command: SlashCommand): void {
        if (this.commands.has(command.name)) {
            console.warn(`Command ${command.name} is already registered. Overwriting.`);
        }
        this.commands.set(command.name, command);
    }

    get(name: string): SlashCommand | undefined {
        return this.commands.get(name);
    }

    getAll(): SlashCommand[] {
        return Array.from(this.commands.values());
    }

    async execute(input: string, context: CommandContext): Promise<void> {
        const [commandName, ...args] = input.slice(1).split(' ');

        // Support case-insensitive command names
        const command = this.commands.get(commandName.toLowerCase());

        if (!command) {
            console.log(`Unknown command: /${commandName}`);
            return;
        }

        try {
            await command.execute(args, context);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
        }
    }
}
