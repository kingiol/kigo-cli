/**
 * Sub-agent manager for orchestrating specialized agents.
 */

import { Agent } from './Agent.js';
import { AgentScheduler } from './Scheduler.js';
import type { BaseProvider } from '../models/BaseProvider.js';
import type { Tool, StreamingEvent, Usage, Message } from '../types.js';

export interface SubAgentProfile {
  id: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
  allowedTools?: string[];
  blockedTools?: string[];
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  parallelToolCalls?: boolean;
  toolChoice?: any;
  responseFormat?: any;
  toolRateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
}

export interface SubAgentRunOptions {
  task: string;
  context?: string;
  profileId?: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
  allowedTools?: string[];
  blockedTools?: string[];
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  parallelToolCalls?: boolean;
  toolChoice?: any;
  responseFormat?: any;
  toolRateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  depth?: number;
  returnEvents?: boolean;
}

export interface SubAgentResult {
  output: string;
  usage?: Usage;
  durationMs: number;
  messages: Message[];
  events?: StreamingEvent[];
}

export interface SubAgentManagerOptions {
  tools: Tool[];
  defaultProvider: BaseProvider;
  providerFactory?: (profile: SubAgentProfile) => BaseProvider;
  defaultSystemPrompt?: string;
  profiles?: SubAgentProfile[];
  maxConcurrent?: number;
  maxDepth?: number;
}

class Semaphore {
  private inflight = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.inflight < this.maxConcurrent) {
      this.inflight += 1;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
    this.inflight += 1;
  }

  release(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

export class SubAgentManager {
  private tools: Tool[];
  private defaultProvider: BaseProvider;
  private providerFactory?: (profile: SubAgentProfile) => BaseProvider;
  private defaultSystemPrompt: string;
  private profiles: Map<string, SubAgentProfile>;
  private semaphore: Semaphore;
  private maxDepth: number;

  constructor(options: SubAgentManagerOptions) {
    this.tools = options.tools;
    this.defaultProvider = options.defaultProvider;
    this.providerFactory = options.providerFactory;
    this.defaultSystemPrompt = options.defaultSystemPrompt || 'You are a specialized sub-agent.';
    this.profiles = new Map();
    this.maxDepth = options.maxDepth ?? 2;
    this.semaphore = new Semaphore(options.maxConcurrent ?? 2);

    for (const profile of options.profiles || []) {
      this.profiles.set(profile.id, profile);
    }
  }

  registerProfile(profile: SubAgentProfile): void {
    this.profiles.set(profile.id, profile);
  }

  removeProfile(profileId: string): boolean {
    return this.profiles.delete(profileId);
  }

  listProfiles(): SubAgentProfile[] {
    return Array.from(this.profiles.values());
  }

  async runSubAgent(options: SubAgentRunOptions): Promise<SubAgentResult> {
    const depth = options.depth ?? 1;
    if (depth > this.maxDepth) {
      throw new Error(`Sub-agent depth limit exceeded (max ${this.maxDepth})`);
    }

    const start = Date.now();
    await this.semaphore.acquire();

    try {
      const profile = options.profileId ? this.profiles.get(options.profileId) : undefined;
      const mergedProfile: SubAgentProfile = {
        id: profile?.id || 'default',
        systemPrompt: options.systemPrompt ?? profile?.systemPrompt,
        model: options.model ?? profile?.model,
        tools: options.tools ?? profile?.tools,
        allowedTools: options.allowedTools ?? profile?.allowedTools,
        blockedTools: this.mergeToolLists(profile?.blockedTools, options.blockedTools),
        maxTokens: options.maxTokens ?? profile?.maxTokens,
        temperature: options.temperature ?? profile?.temperature,
        maxRetries: options.maxRetries ?? profile?.maxRetries,
        retryDelayMs: options.retryDelayMs ?? profile?.retryDelayMs,
        timeoutMs: options.timeoutMs ?? profile?.timeoutMs,
        parallelToolCalls: options.parallelToolCalls ?? profile?.parallelToolCalls,
        toolChoice: options.toolChoice ?? profile?.toolChoice,
        responseFormat: options.responseFormat ?? profile?.responseFormat,
        toolRateLimit: options.toolRateLimit ?? profile?.toolRateLimit,
      };

      const systemPrompt = this.buildSystemPrompt(
        mergedProfile.systemPrompt || this.defaultSystemPrompt,
        options.context
      );

      const provider = this.getProvider(mergedProfile);
      const selectedTools = this.selectTools(
        mergedProfile.tools,
        mergedProfile.allowedTools,
        mergedProfile.blockedTools
      );

      const agent = new Agent({
        provider,
        systemPrompt,
        tools: selectedTools,
        maxTokens: mergedProfile.maxTokens,
        temperature: mergedProfile.temperature,
        maxRetries: mergedProfile.maxRetries,
        retryDelayMs: mergedProfile.retryDelayMs,
        timeoutMs: mergedProfile.timeoutMs,
        parallelToolCalls: mergedProfile.parallelToolCalls,
        toolChoice: mergedProfile.toolChoice,
        responseFormat: mergedProfile.responseFormat,
        toolRateLimit: mergedProfile.toolRateLimit,
        subAgentDepth: depth,
      });

      const scheduler = new AgentScheduler(agent, { sessionId: `subagent_${Date.now()}` });
      const events: StreamingEvent[] = [];
      let output = '';
      let usage: Usage | undefined;

      const run = async () => {
        for await (const event of scheduler.run(options.task)) {
          events.push(event);
          if (event.type === 'text_delta') {
            output += event.data;
          } else if (event.type === 'done') {
            usage = event.data?.usage;
          } else if (event.type === 'error') {
            throw new Error(event.data);
          }
        }
      };

      if (mergedProfile.timeoutMs && mergedProfile.timeoutMs > 0) {
        await this.runWithTimeout(run, mergedProfile.timeoutMs);
      } else {
        await run();
      }

      if (!output) {
        const messages = agent.getMessages();
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant?.content) {
          output = lastAssistant.content;
        }
      }

      return {
        output,
        usage,
        durationMs: Date.now() - start,
        messages: agent.getMessages(),
        events: options.returnEvents ? events : undefined,
      };
    } finally {
      this.semaphore.release();
    }
  }

  private mergeToolLists(primary?: string[], secondary?: string[]): string[] | undefined {
    if (!primary && !secondary) return undefined;
    return [...(primary || []), ...(secondary || [])];
  }

  private buildSystemPrompt(basePrompt: string, context?: string): string {
    if (!context) return basePrompt;
    return `${basePrompt}\n\nContext:\n${context}`;
  }

  private selectTools(
    toolNames?: string[],
    allowedTools?: string[],
    blockedTools?: string[]
  ): Tool[] {
    let selected = this.tools;
    if (toolNames && toolNames.length > 0) {
      const nameSet = new Set(toolNames);
      selected = selected.filter(tool => nameSet.has(tool.name));
    }

    if (allowedTools && allowedTools.length > 0) {
      const allowed = new Set(allowedTools);
      selected = selected.filter(tool => allowed.has(tool.name));
    }

    if (blockedTools && blockedTools.length > 0) {
      const blocked = new Set(blockedTools);
      selected = selected.filter(tool => !blocked.has(tool.name));
    }

    return selected;
  }

  private getProvider(profile: SubAgentProfile): BaseProvider {
    if (this.providerFactory) {
      return this.providerFactory(profile);
    }
    return this.defaultProvider;
  }

  private async runWithTimeout(run: () => Promise<void>, timeoutMs: number): Promise<void> {
    let timeoutId: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Sub-agent timed out')), timeoutMs);
    });
    await Promise.race([run(), timeout]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
