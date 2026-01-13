
import { Agent, Session } from '@kigo/core';
import { MCPManager } from '@kigo/mcp';
import { getConfigManager } from '../../config/ConfigManager.js';

export type ConfigManager = Awaited<ReturnType<typeof getConfigManager>>;

export interface CommandContext {
    agent: Agent;
    session: Session;
    configManager: ConfigManager;
    mcpManager: MCPManager;
    // Function to clean up resources (close connections, etc.)
    cleanup?: () => Promise<void>;
    registry: ISlashCommandRegistry;
}

export interface ISlashCommandRegistry {
    register(command: SlashCommand): void;
    get(name: string): SlashCommand | undefined;
    getAll(): SlashCommand[];
    execute(input: string, context: CommandContext): Promise<void>;
}

export interface SlashCommand {
    name: string;
    description: string;
    execute(args: string[], context: CommandContext): Promise<void>;
}
