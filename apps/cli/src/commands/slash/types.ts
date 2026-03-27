
import { Agent, PlanSessionController, Session } from '@kigo/core';
import { MCPManager } from '@kigo/mcp';
import type { MailboxStore, TaskManager } from '@kigo/tools';
import { getConfigManager } from '../../config/ConfigManager.js';
import { PermissionController } from '../../interactive/PermissionController.js';

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

export interface ToolCatalogEntry {
    name: string;
    description: string;
    source: 'builtin' | 'local' | 'plugin' | 'mcp';
}

export interface HasAgent {
    agent: Agent;
}

export interface HasSession {
    session: Session;
}

export interface HasConfigManager {
    configManager: ConfigManager;
}

export interface HasMCPManager {
    mcpManager: MCPManager;
}

export interface HasPermissionController {
    permissionController?: PermissionController;
}

export interface HasPlanSessionController {
    planSessionController?: PlanSessionController;
}

export interface HasTaskManager {
    taskManager?: TaskManager;
}

export interface HasMailboxStore {
    mailboxStore?: MailboxStore;
}

export interface HasPlanModeControls {
    isPlanModeEnabled?: () => boolean;
    setPlanModeEnabled?: (enabled: boolean) => void;
}

export interface HasActiveAgentControls {
    getActiveAgentId?: () => string;
    setActiveAgentId?: (id: string) => boolean;
}

export interface HasTaskSchedulerState {
    getTaskSchedulerState?: () => TaskSchedulerState;
}

export interface HasToolsCatalog {
    toolsCatalog?: ToolCatalogEntry[];
}

export interface HasCleanup {
    cleanup?: () => Promise<void>;
}

export interface HasRegistry {
    registry: ISlashCommandRegistry;
}

export interface CommandContext extends
    HasAgent,
    HasSession,
    HasConfigManager,
    HasMCPManager,
    HasPermissionController,
    HasPlanSessionController,
    HasTaskManager,
    HasMailboxStore,
    HasPlanModeControls,
    HasActiveAgentControls,
    HasTaskSchedulerState,
    HasToolsCatalog,
    HasCleanup,
    HasRegistry {}

export type HelpCommandContext = HasRegistry;
export type ClearCommandContext = HasAgent & HasSession;
export type ConfigCommandContext = HasConfigManager;
export type ExitCommandContext = HasCleanup;
export type SessionCommandContext = HasSession;
export type ToolsCommandContext = HasToolsCatalog;
export type MailCommandContext = HasMailboxStore & HasSession;
export type PermissionsCommandContext = HasPermissionController;
export type AgentCommandContext = HasActiveAgentControls & HasPlanSessionController;
export type PlanCommandContext = HasAgent & HasPlanSessionController & HasPlanModeControls & HasActiveAgentControls;
export type StatusCommandContext = HasAgent & HasSession & HasConfigManager & HasActiveAgentControls;
export type TaskCommandContext = HasTaskManager & HasSession & HasTaskSchedulerState & HasPlanModeControls;

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
