
import { Agent, Session } from '@kigo/core';
import { MCPManager } from '@kigo/mcp';
import type { MailboxStore } from '@kigo/tools';
import { getConfigManager } from '../../config/ConfigManager.js';
import { PermissionController } from '../../interactive/PermissionController.js';
import { PlanSessionController } from '../../interactive/PlanSessionController.js';
import { TaskManager } from '../../interactive/TaskManager.js';

export type ConfigManager = Awaited<ReturnType<typeof getConfigManager>>;

export type TaskSchedulerSkipReason =
    | "interactive_busy"
    | "scheduler_busy"
    | "plan_mode"
    | "task_running"
    | "no_resumable_tasks"
    | "error";

export interface TaskSchedulerState {
    enabled: boolean;
    pollMs: number;
    interactiveRunCount: number;
    autoResumeInFlight: boolean;
    lastTickAt?: number;
    lastResumeAt?: number;
    lastResumedTaskId?: number;
    lastResumeRunId?: string;
    lastResumedCount?: number;
    lastSkipReason?: TaskSchedulerSkipReason;
    lastError?: string;
}

export interface CommandContext {
    agent: Agent;
    session: Session;
    configManager: ConfigManager;
    mcpManager: MCPManager;
    permissionController?: PermissionController;
    planSessionController?: PlanSessionController;
    taskManager?: TaskManager;
    mailboxStore?: MailboxStore;
    isPlanModeEnabled?: () => boolean;
    setPlanModeEnabled?: (enabled: boolean) => void;
    getActiveAgentId?: () => string;
    setActiveAgentId?: (id: string) => boolean;
    getTaskSchedulerState?: () => TaskSchedulerState;
    toolsCatalog?: Array<{ name: string; description: string; source: 'builtin' | 'local' | 'plugin' | 'mcp' }>;
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
