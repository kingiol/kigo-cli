/**
 * Interactive runtime shared by legacy and Ink UIs
 */

import chalk from "chalk";
import {
  Agent,
  AgentRegistry,
  AgentScheduler,
  type CompactionArtifact,
  ExecutionModeController,
  PlanSessionController,
  ProviderFactory,
  Session,
} from "@kigo/core";
import { getConfigManager } from "../config/ConfigManager.js";
import {
  CompactionRuntime,
  MailboxStore,
  TaskManager,
  SubAgentRuntime,
  registry,
  SkillLoader,
} from "@kigo/tools";
import { MCPManager } from "@kigo/mcp";
import { StatusLine } from "../display/StatusLine.js";
import { createSlashCommandRegistry } from "../commands/slash/createRegistry.js";
import type { CommandContext, TaskSchedulerState } from "../commands/slash/types.js";
import { PermissionController } from "./PermissionController.js";
import { promptForToolApproval } from "./approvalPrompt.js";
import { PluginManager } from "@kigo/plugin";
import {
  type InteractiveOptions,
  type RuntimeEvent,
  type InteractiveRuntime,
  parseAnswerQuestionsPayload,
} from "./runtimeTypes.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { runWithTimeout, truncateOutput, wrapExternalTool } from "./runtimeTools.js";

const AUTO_RESUME_POLL_MS = 3000;

function createTaskSchedulerStateSnapshot(
  state: TaskSchedulerState,
  interactiveRunCount: number,
  autoResumeInFlight: boolean,
): TaskSchedulerState {
  return {
    ...state,
    interactiveRunCount,
    autoResumeInFlight,
  };
}

export async function createInteractiveRuntime(
  configManager: Awaited<ReturnType<typeof getConfigManager>>,
  options: InteractiveOptions
): Promise<InteractiveRuntime> {
  const loadedConfig = await configManager.load();
  const permissionController = new PermissionController(loadedConfig.permissions, {
    persist: async (permissions) => {
      loadedConfig.permissions = {
        ...loadedConfig.permissions,
        ...permissions,
        allow: [...permissions.allow],
        block: [...permissions.block],
      };
      await configManager.save(loadedConfig);
    },
  });
  registry.clearBySource(["local", "plugin"]);

  const skillLoader = new SkillLoader();
  const skillsMetadata = await skillLoader.discoverSkills();
  const mcpManager = new MCPManager();
  const mcpServers = await configManager.getMCPServers();
  let mcpTools = mcpManager.getTools();
  if (mcpServers.length > 0) {
    await mcpManager.initialize(mcpServers);
    mcpTools = mcpManager.getTools();
    const mcpToolCount = mcpTools.length;
    if (mcpToolCount > 0) {
      const connectedServers = mcpManager.getConnectedServers();
      console.log(
        chalk.dim(
          `MCP: Connected to ${connectedServers.length} server(s), ${mcpToolCount} tool(s)`
        )
      );
    }
  }

  const systemPrompt = buildSystemPrompt({
    builtinToolNames: registry.getNames(),
    skillsMetadata,
    mcpTools,
  });

  const toolsConfig = configManager.getToolsConfig();
  const compactionConfig = configManager.getCompactionConfig();
  const providerConfig = configManager.getProviderConfig();
  const provider = providerConfig.provider;
  const modelName = options.model || providerConfig.model || configManager.getModelName();
  process.env.KIGO_PROJECT_ROOT = process.cwd();

  if (!providerConfig.apiKey && provider !== "ollama") {
    console.error(
      chalk.red(
        `No API key found for provider "${provider}". Please set an API key environment variable or config.`
      )
    );
    process.exit(1);
  }

  // Create provider
  const llmProvider = ProviderFactory.create({
    provider,
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
    model: modelName,
    azureApiVersion: providerConfig.azureApiVersion,
  });

  // Create session
  const session = new Session(options.session);
  const sessionId = session.getId();
  const sessionHistory = await session.getMessages();
  const planSessionController = new PlanSessionController(process.cwd(), sessionId);

  const pluginManager = new PluginManager(process.cwd());

  const pluginContext: PluginExecutionContext = {
    cwd: process.cwd(),
    sessionId,
    env: process.env,
  };

  const localTools = await pluginManager.loadLocalTools(configManager.getToolLoadPaths());
  for (const localTool of localTools) {
    registry.registerExternal(
      wrapExternalTool(localTool, pluginContext, toolsConfig.timeoutMs, toolsConfig.maxOutputChars),
      "local",
      localTool.origin,
    );
  }

  const loadedPlugins = await pluginManager.loadPlugins(configManager.getPlugins());
  for (const pluginTool of loadedPlugins.tools) {
    registry.registerExternal(
      wrapExternalTool(pluginTool, pluginContext, toolsConfig.timeoutMs, toolsConfig.maxOutputChars),
      "plugin",
      pluginTool.origin,
    );
  }

  if (localTools.length > 0 || loadedPlugins.tools.length > 0) {
    console.log(
      chalk.dim(
        `Extensions: local tools ${localTools.length}, plugin tools ${loadedPlugins.tools.length}`
      )
    );
  }

  const subAgentRuntime = new SubAgentRuntime({
    allowNestedDefault: false,
    getSessionId: () => sessionId,
  });
  const compactionRuntime = new CompactionRuntime({
    getSessionId: () => sessionId,
  });

  const agentRegistry = new AgentRegistry(configManager.getAgentOverrides());
  const executionMode = new ExecutionModeController(agentRegistry, "build");

  const builtInTools = registry.getAll();
  const toolsCatalog = registry.getCatalog();
  const toolSourceMap = new Map<string, "builtin" | "local" | "plugin" | "mcp">([
    ...toolsCatalog.map((tool) => [tool.name, tool.source]),
    ...mcpTools.map((tool) => [tool.name, "mcp" as const]),
  ]);

  const createGuardedTool = (tool: RuntimeTool): RuntimeTool => ({
    ...tool,
    execute: async (params: any, executionContext?: any): Promise<string> => {
      const toolSource = toolSourceMap.get(tool.name) || "builtin";
      const modeDecision = executionMode.evaluateTool(tool.name);
      if (!modeDecision.allowed) {
        return `Tool blocked by active agent (${executionMode.getActiveAgentId()}): ${tool.name}`;
      }

      const planDecision = planSessionController.evaluateTool(tool.name, params, toolSource);
      if (!planDecision.allowed) {
        return `Tool blocked while plan is pending: ${tool.name} (${planDecision.reason})`;
      }

      let decision = permissionController.evaluate(tool.name, params, toolSource);
      if (decision.requiresApproval) {
        const action = await promptForToolApproval({
          toolName: tool.name,
          toolSource,
          params,
          decision,
        });
        decision = await permissionController.applyDecision(tool.name, params, action, toolSource);
      }

      await permissionController.recordAudit(tool.name, params, decision);
      if (!decision.allowed) {
        return `Permission denied for ${tool.name}: ${decision.reason}`;
      }

      const result = await runWithTimeout(
        Promise.resolve(tool.execute(params, executionContext)),
        toolsConfig.timeoutMs,
      );
      return truncateOutput(result, toolsConfig.maxOutputChars);
    },
  });

  const allTools = [...builtInTools.map(createGuardedTool), ...mcpTools.map(createGuardedTool)];

  const subAgentManager = subAgentRuntime.createManager(sessionId, {
    tools: allTools,
    defaultProvider: llmProvider,
    providerFactory: (profile) =>
      ProviderFactory.create({
        provider,
        apiKey: providerConfig.apiKey,
        baseURL: providerConfig.baseURL,
        model: profile.model || modelName,
        azureApiVersion: providerConfig.azureApiVersion,
      }),
    defaultSystemPrompt:
      "You are a specialized sub-agent. Be concise and return only what was asked.",
    maxConcurrent: 2,
    maxDepth: 2,
  });
  const taskManager = new TaskManager(subAgentManager, sessionId);
  const mailboxStore = new MailboxStore(process.cwd());

  // Create agent
  const agent = new Agent({
    provider: llmProvider,
    systemPrompt,
    tools: allTools,
    reasoningEffort: providerConfig.reasoningEffort,
    sessionId,
    compaction: compactionConfig,
    toolContext: () => ({
      agentId: executionMode.getActiveAgentId(),
    }),
  });
  if (sessionHistory.length > 0) {
    agent.loadMessages(sessionHistory);
  }
  compactionRuntime.register(sessionId, {
    compact: async ({ reason }): Promise<CompactionArtifact | null> =>
      agent.compact({ mode: "manual", reason }),
  });
  let lastSavedMessageIndex = sessionHistory.length;

  // Create scheduler
  const scheduler = new AgentScheduler(agent, {
    sessionId,
    streaming: options.stream !== false,
    getActiveAgentId: () => executionMode.getActiveAgentId(),
    getExecutionMode: () => executionMode.getActiveAgentId(),
  });

  const statusLine = new StatusLine(sessionId, modelName);
  let interactiveRunCount = 0;
  let autoResumeInFlight = false;
  const taskSchedulerState: TaskSchedulerState = {
    enabled: true,
    pollMs: AUTO_RESUME_POLL_MS,
    interactiveRunCount: 0,
    autoResumeInFlight: false,
  };

  const markSchedulerSkip = (reason: TaskSchedulerState["lastSkipReason"]): void => {
    taskSchedulerState.lastTickAt = Date.now();
    taskSchedulerState.lastSkipReason = reason;
    taskSchedulerState.lastResumedCount = 0;
  };

  const autoResumeTimer = setInterval(() => {
    taskSchedulerState.lastTickAt = Date.now();
    taskSchedulerState.interactiveRunCount = interactiveRunCount;
    taskSchedulerState.autoResumeInFlight = autoResumeInFlight;

    if (interactiveRunCount > 0 || autoResumeInFlight) {
      markSchedulerSkip(interactiveRunCount > 0 ? "interactive_busy" : "scheduler_busy");
      return;
    }
    if (executionMode.isPlanMode()) {
      markSchedulerSkip("plan_mode");
      return;
    }
    if (taskManager.getStats().running > 0) {
      markSchedulerSkip("task_running");
      return;
    }

    autoResumeInFlight = true;
    taskSchedulerState.autoResumeInFlight = true;
    void taskManager
      .runResumableTaskNodes({ limit: 1, runInBackground: true })
      .then((records) => {
        taskSchedulerState.lastTickAt = Date.now();
        if (records.length === 0) {
          markSchedulerSkip("no_resumable_tasks");
          taskSchedulerState.lastError = undefined;
          return;
        }

        const latest = records[records.length - 1];
        taskSchedulerState.lastResumeAt = Date.now();
        taskSchedulerState.lastResumedTaskId = latest.taskNodeId;
        taskSchedulerState.lastResumeRunId = latest.id;
        taskSchedulerState.lastResumedCount = records.length;
        taskSchedulerState.lastSkipReason = undefined;
        taskSchedulerState.lastError = undefined;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        taskSchedulerState.lastTickAt = Date.now();
        taskSchedulerState.lastSkipReason = "error";
        taskSchedulerState.lastError = message;
        taskSchedulerState.lastResumedCount = 0;
        console.error(chalk.dim(`Auto-resume failed: ${message}`));
      })
      .finally(() => {
        autoResumeInFlight = false;
        taskSchedulerState.autoResumeInFlight = false;
        taskSchedulerState.interactiveRunCount = interactiveRunCount;
      });
  }, AUTO_RESUME_POLL_MS);

  // Initialize slash command registry
  const slashRegistry = createSlashCommandRegistry();

  async function runInput(
    input: string,
    onEvent: (event: RuntimeEvent) => void
  ): Promise<void> {
    interactiveRunCount += 1;
    taskSchedulerState.interactiveRunCount = interactiveRunCount;
    let lastUsage: any = undefined;
    let sawDone = false;
    const toolCallNameMap = new Map<string, string>();

    try {
      for await (const event of scheduler.run(input)) {
        if (event.type === "tool_call") {
          toolCallNameMap.set(event.data.id, event.data.name);
          let args = {};
          try {
            args = JSON.parse(event.data.arguments || "{}");
          } catch (e) {
            args = { raw: event.data.arguments };
          }
          onEvent({
            type: event.type,
            data: event.data,
            toolName: event.data.name,
            toolArgs: args,
          });
          continue;
        }

        if (event.type === "tool_output") {
          const toolName = toolCallNameMap.get(event.data.id) || "tool";
          const questionnaire = parseAnswerQuestionsPayload(event.data.result);
          onEvent({
            type: event.type,
            data: event.data,
            toolName,
            questionnaire,
          });
        } else {
          onEvent({
            type: event.type,
            data: event.data,
          });
        }

        if (event.type === "done") {
          lastUsage = event.data?.usage;
          sawDone = true;
        }
      }

      // Persist new messages in order
      const messages = agent.getMessages();
      if (messages.length > lastSavedMessageIndex) {
        const newMessages = messages.slice(lastSavedMessageIndex);
        await session.saveMessages(newMessages);
        lastSavedMessageIndex = messages.length;
      }

      if (lastUsage) {
        session.recordUsage(lastUsage);
      }
      session.updateContextTokens(session.getContextTokenCount());

      if (sawDone) {
        const latestAssistant = [...messages]
          .reverse()
          .find((message) => message.role === "assistant" && message.content.trim().length > 0);
        if (latestAssistant) {
          await planSessionController.captureDraft(latestAssistant.content);
        }
      }

      // Update status line
      statusLine.updateUsage(session.getUsage() as any);
    } finally {
      interactiveRunCount = Math.max(0, interactiveRunCount - 1);
      taskSchedulerState.interactiveRunCount = interactiveRunCount;
    }
  }

  async function handleSlashCommand(
    input: string,
    extraCleanup?: () => Promise<void>
  ): Promise<void> {
    const context = {
      agent,
      session,
      configManager,
      mcpManager,
      permissionController,
      planSessionController,
      taskManager,
      mailboxStore,
      isPlanModeEnabled: () => executionMode.isPlanMode(),
      setPlanModeEnabled: (enabled: boolean) => {
        executionMode.setActiveAgent(enabled ? "plan" : "build");
      },
      getActiveAgentId: () => executionMode.getActiveAgentId(),
      setActiveAgentId: (id: string) => executionMode.setActiveAgent(id),
      getTaskSchedulerState: () =>
        createTaskSchedulerStateSnapshot(taskSchedulerState, interactiveRunCount, autoResumeInFlight),
      toolsCatalog: [
        ...toolsCatalog.map((tool) => ({
          name: tool.name,
          description: tool.description,
          source: tool.source,
        })),
        ...mcpTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          source: "mcp" as const,
        })),
      ],
      registry: slashRegistry,
      cleanup: async () => {
        clearInterval(autoResumeTimer);
        compactionRuntime.remove(sessionId);
        await mcpManager.close();
        session.close();
        if (extraCleanup) {
          await extraCleanup();
        }
      },
    } satisfies CommandContext;
    await slashRegistry.execute(input, context);
  }

  async function close(): Promise<void> {
    clearInterval(autoResumeTimer);
    compactionRuntime.remove(sessionId);
    await mcpManager.close();
    session.close();
  }

  return {
    runInput,
    handleSlashCommand,
    close,
    getStatusLine: () => statusLine,
    getSessionId: () => sessionId,
    getSlashRegistry: () => slashRegistry,
    isPlanModeEnabled: () => executionMode.isPlanMode(),
    setPlanModeEnabled: (enabled: boolean) => {
      executionMode.setActiveAgent(enabled ? "plan" : "build");
    },
    getTaskSchedulerState: () =>
      createTaskSchedulerStateSnapshot(taskSchedulerState, interactiveRunCount, autoResumeInFlight),
  };
}

export type {
  AnswerQuestionsPayload,
  InteractiveOptions,
  InteractiveRuntime,
  RuntimeEvent,
} from "./runtimeTypes.js";
