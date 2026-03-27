import type { WebContents } from 'electron';
import os from 'node:os';
import path from 'node:path';
import {
  Agent,
  AgentScheduler,
  PermissionController,
  Session,
  type CompactionArtifact,
  type PermissionDecisionAction,
  type StreamingEvent,
  type ToolExecutionSource
} from '@kigo/core';
import { ProviderFactory } from '@kigo/core';
import { MCPManager } from '@kigo/mcp';
import { CompactionRuntime, SubAgentRuntime, registry, SkillLoader } from '@kigo/tools';
import '@kigo/tools';
import type { KigoConfig } from '@kigo/config';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { appendAudit } from './auditStore.js';
import { saveConfig } from './config.js';

const DEFAULT_SYSTEM_PROMPT = `You are Kigo Desktop, a focused AI coding assistant.
Use available tools when they are the best way to complete a task.`;

const expandTilde = (value: string): string => {
  if (!value.startsWith('~')) return value;
  return path.join(os.homedir(), value.slice(1));
};

type ApprovalRequest = {
  requestId: string;
  tool: {
    name: string;
    source: ToolExecutionSource;
    params: unknown;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    reason: string;
  };
};

class ApprovalManager {
  private pending = new Map<string, (action: PermissionDecisionAction) => void>();

  constructor(private webContents: WebContents, private sessionId: string) {}

  request(tool: ApprovalRequest['tool']): Promise<PermissionDecisionAction> {
    const requestId = `${this.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = { sessionId: this.sessionId, requestId, tool };
    this.webContents.send(IPC_CHANNELS.chatApproval, payload);
    void appendAudit({
      sessionId: this.sessionId,
      timestamp: Date.now(),
      type: 'approval_request',
      data: payload
    });

    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
    });
  }

  resolve(requestId: string, action: PermissionDecisionAction): boolean {
    const handler = this.pending.get(requestId);
    if (!handler) return false;
    handler(action);
    this.pending.delete(requestId);
    void appendAudit({
      sessionId: this.sessionId,
      timestamp: Date.now(),
      type: 'approval_decision',
      data: { requestId, action }
    });
    return true;
  }

  rejectAll(): void {
    for (const [, resolve] of this.pending) {
      resolve('deny_once');
    }
    this.pending.clear();
  }
}

type ChatSession = {
  sessionId: string;
  approvalManager: ApprovalManager;
  mcpManager: MCPManager;
};

export class ChatService {
  private sessions = new Map<string, ChatSession>();
  private subAgentRuntime = new SubAgentRuntime({ allowNestedDefault: false });
  private compactionRuntime = new CompactionRuntime();

  constructor(private getWebContents: () => WebContents | null) {}

  async start(input: string, config: KigoConfig, existingSessionId?: string): Promise<string> {
    const webContents = this.getWebContents();
    if (!webContents) throw new Error('No active window');

    const provider = ProviderFactory.create({
      provider: config.model.provider,
      apiKey: config.model.apiKey,
      baseURL: config.model.baseUrl,
      model: config.model.name,
      azureApiVersion: config.model.azureApiVersion
    });

    const skillLoader = config.skills?.enabled
      ? new SkillLoader(
          config.skills.projectSkillsDir ? expandTilde(config.skills.projectSkillsDir) : undefined,
          config.skills.userSkillsDir ? expandTilde(config.skills.userSkillsDir) : undefined
        )
      : null;
    const skillsMetadata = skillLoader ? await skillLoader.discoverSkills() : [];
    const skillsPrompt =
      skillsMetadata.length > 0
        ? skillsMetadata.map((s) => `- ${s.name}: ${s.description}`).join('\n')
        : 'No skills available.';

    let systemPrompt = `${DEFAULT_SYSTEM_PROMPT}\n\nSkills:\n${skillsPrompt}`;

    const mcpManager = new MCPManager();
    await mcpManager.initialize(config.mcpServers ?? []);

    const sessionId = existingSessionId ?? `desktop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    process.env.KIGO_PROJECT_ROOT = process.cwd();
    const approvalManager = new ApprovalManager(webContents, sessionId);
    const permissionController = new PermissionController(config.permissions, {
      persist: async (permissions) => {
        config.permissions = {
          ...config.permissions,
          ...permissions,
          allow: [...permissions.allow],
          block: [...permissions.block]
        };
        await saveConfig(config);
      }
    });
    const sessionStore = new Session(sessionId);
    const history = await sessionStore.getMessages();

    const wrapTool = (
      tool: { name: string; description: string; parameters: any; execute: (params: any) => Promise<string> },
      source: ToolExecutionSource
    ) => ({
      ...tool,
      execute: async (params: any) => {
        let decision = permissionController.evaluate(tool.name, params, source);
        if (decision.requiresApproval) {
          const action = await approvalManager.request({
            name: tool.name,
            source,
            params,
            riskLevel: decision.risk.level,
            reason: decision.risk.reason
          });
          decision = await permissionController.applyDecision(tool.name, params, action, source);
        }
        await permissionController.recordAudit(tool.name, params, decision);
        if (!decision.allowed) {
          return `Permission denied for ${tool.name}: ${decision.reason}`;
        }
        return tool.execute(params);
      }
    });

    const builtinTools = registry.getAll().map((tool) => wrapTool(tool, 'builtin'));
    const mcpTools = mcpManager.getTools().map((tool) => wrapTool(tool, 'mcp'));
    const mcpToolsInfo = mcpManager
      .getTools()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');
    if (mcpToolsInfo) {
      systemPrompt += `\n\nMCP Tools:\n${mcpToolsInfo}`;
    }

    this.subAgentRuntime.createManager(sessionId, {
      tools: [...builtinTools, ...mcpTools],
      defaultProvider: provider,
      providerFactory: (profile) =>
        ProviderFactory.create({
          provider: config.model.provider,
          apiKey: config.model.apiKey,
          baseURL: config.model.baseUrl,
          model: profile.model || config.model.name,
          azureApiVersion: config.model.azureApiVersion
        }),
      defaultSystemPrompt: 'You are a specialized sub-agent. Be concise and return only what was asked.',
      maxConcurrent: 2,
      maxDepth: 2
    });

    const agent = new Agent({
      provider,
      systemPrompt,
      tools: [...builtinTools, ...mcpTools],
      sessionId,
      compaction: config.compaction
    });
    agent.loadMessages(history);
    this.compactionRuntime.register(sessionId, {
      compact: async ({ reason }): Promise<CompactionArtifact | null> =>
        agent.compact({ mode: 'manual', reason })
    });

    const scheduler = new AgentScheduler(agent);

    this.sessions.set(sessionId, { sessionId, approvalManager, mcpManager });

    const emit = (event: StreamingEvent) => {
      webContents.send(IPC_CHANNELS.chatEvent, { sessionId, event });
    };

    (async () => {
      let assistantBuffer = '';
      try {
        if (input.trim().length > 0) {
          await sessionStore.saveMessage({ role: 'user', content: input });
          const existingTitle = sessionStore.getTitle();
          if (!existingTitle) {
            const summary = summarizeTitle(input);
            if (summary) {
              await sessionStore.setTitle(summary);
            }
          }
        }
        for await (const event of scheduler.run(input)) {
          if (event.type === 'tool_call') {
            await appendAudit({
              sessionId,
              timestamp: Date.now(),
              type: 'tool_call',
              data: event.data
            });
          }
          if (event.type === 'text_delta') {
            assistantBuffer += String(event.data ?? '');
          }
          if (event.type === 'tool_output') {
            const output = event.data?.error ?? event.data?.result ?? '';
            await sessionStore.saveMessage({
              role: 'tool',
              content: String(output),
              toolCallId: event.data?.id
            });
            await appendAudit({
              sessionId,
              timestamp: Date.now(),
              type: 'tool_output',
              data: event.data
            });
          }
          emit(event);
          if (event.type === 'done') {
            if (assistantBuffer.trim().length > 0) {
              await sessionStore.saveMessage({ role: 'assistant', content: assistantBuffer });
            }
          }
        }
      } catch (error) {
        emit({ type: 'error', data: error instanceof Error ? error.message : String(error) });
      } finally {
        approvalManager.rejectAll();
        await mcpManager.close();
        sessionStore.close();
        this.sessions.delete(sessionId);
        this.compactionRuntime.remove(sessionId);
        this.subAgentRuntime.removeManager(sessionId);
      }
    })();

    return sessionId;
  }

  approve(sessionId: string, requestId: string, action: PermissionDecisionAction): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.approvalManager.resolve(requestId, action);
  }
}

function summarizeTitle(input: string): string | null {
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const sentence = cleaned.split(/[.!?]/)[0] || cleaned;
  const trimmed = sentence.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}...`;
}
