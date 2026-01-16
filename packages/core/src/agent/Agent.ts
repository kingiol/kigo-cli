/**
 * Agent class for managing AI interactions
 */

import type { Tool, StreamingEvent, Message } from '../types.js';

export interface AgentOptions {
  provider: any;
  systemPrompt: string;
  tools?: Tool[];
  maxTokens?: number;
  temperature?: number;
  sessionId?: string;
  subAgentDepth?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  parallelToolCalls?: boolean;
  toolChoice?: any;
  allowedTools?: string[];
  blockedTools?: string[];
  responseFormat?: any;
  toolRateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
}

export class Agent {
  private tools: Map<string, Tool> = new Map();
  private messages: Message[] = [];
  private maxTokens: number;
  private temperature: number;
  private subAgentDepth?: number;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  private parallelToolCalls: boolean;
  private allowedTools: Set<string>;
  private blockedTools: Set<string>;
  private toolRateLimit?: { maxCalls: number; windowMs: number };
  private toolCallTimes: Map<string, number[]> = new Map();

  constructor(private options: AgentOptions) {
    this.maxTokens = options.maxTokens || 4096;
    this.temperature = options.temperature || 0.7;
    this.subAgentDepth = options.subAgentDepth;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 0;
    this.parallelToolCalls = options.parallelToolCalls ?? false;
    this.allowedTools = new Set(options.allowedTools || []);
    this.blockedTools = new Set(options.blockedTools || []);
    this.toolRateLimit = options.toolRateLimit;

    if (options.tools) {
      options.tools.forEach(tool => this.tools.set(tool.name, tool));
    }
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  async *run(input: string): AsyncGenerator<StreamingEvent> {
    if (input) {
      this.messages.push({ role: 'user', content: input });
    }

    while (true) {
      const fullMessages = [
        { role: 'system' as const, content: this.options.systemPrompt },
        ...this.messages,
      ];

      try {
        const response = await this.createStreamWithRetry(fullMessages);

        let currentContent = '';
        let currentToolCalls: any[] = [];
        let lastUsage: any = undefined;
        let finishReason: string | undefined;

        for await (const chunk of response) {
          if (chunk.usage) {
            lastUsage = chunk.usage;
          }

          // Handle text delta
          if (chunk.delta?.content) {
            currentContent += chunk.delta.content;
            yield { type: 'text_delta', data: chunk.delta.content };
          }

          // Handle tool calls
          if (chunk.delta?.tool_calls) {
            for (const call of chunk.delta.tool_calls) {
              let existing;
              // Use index if available (OpenAI), otherwise fallback to ID (Anthropic/Single chunk)
              if (call.index !== undefined) {
                existing = currentToolCalls.find(c => c.index === call.index);
              } else {
                existing = currentToolCalls.find(c => c.id === call.id);
              }

              if (existing) {
                existing.arguments += call.arguments || '';
                // Ensure we capture ID/Name if they come in later chunks (unlikely but safe)
                if (call.id && !existing.id) existing.id = call.id;
                if (call.name && !existing.name) existing.name = call.name;
              } else {
                currentToolCalls.push({
                  index: call.index,
                  id: call.id,
                  name: call.name,
                  arguments: call.arguments || '',
                });
              }
            }
          }

          if (chunk.finish_reason) {
            finishReason = chunk.finish_reason;
          }
        }

        // Tool calls complete
        if (currentToolCalls.length > 0) {
          this.messages.push({
            role: 'assistant',
            content: currentContent,
            toolCalls: currentToolCalls,
          });

          if (this.parallelToolCalls) {
            yield* this.executeToolCallsParallel(currentToolCalls);
          } else {
            for (const toolCall of currentToolCalls) {
              yield* this.executeToolCall(toolCall);
            }
          }

          // Continue conversation without injecting an empty user message
          continue;
        }

        // Conversation complete
        if (finishReason) {
          this.messages.push({ role: 'assistant', content: currentContent });
          yield { type: 'done', data: { usage: lastUsage, finishReason } };
        }

        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        yield { type: 'error', data: errorMsg };
        return;
      }
    }
  }

  private async createStreamWithRetry(fullMessages: Message[]): Promise<AsyncIterable<any>> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      try {
        const responsePromise = this.options.provider.chat({
          messages: fullMessages,
          tools: Array.from(this.tools.values()).map(t => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          })),
          stream: true,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          toolChoice: this.options.toolChoice,
          responseFormat: this.options.responseFormat,
        });
        if (this.timeoutMs > 0) {
          let timeoutId: NodeJS.Timeout | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error('Provider request timed out')),
              this.timeoutMs
            );
          });
          const response = (await Promise.race([responsePromise, timeoutPromise])) as AsyncIterable<any>;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          return response;
        }
        return await responsePromise;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt >= this.maxRetries) {
          throw lastError;
        }
        const delay = this.retryDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt += 1;
      }
    }

    throw lastError || new Error('Failed to start stream');
  }

  private isToolAllowed(name: string): boolean {
    if (this.blockedTools.has(name)) return false;
    if (this.allowedTools.size === 0) return true;
    return this.allowedTools.has(name);
  }

  private isToolRateLimited(name: string): boolean {
    if (!this.toolRateLimit) return false;

    const now = Date.now();
    const times = this.toolCallTimes.get(name) || [];
    const recent = times.filter(t => now - t < this.toolRateLimit!.windowMs);
    if (recent.length >= this.toolRateLimit!.maxCalls) {
      this.toolCallTimes.set(name, recent);
      return true;
    }
    recent.push(now);
    this.toolCallTimes.set(name, recent);
    return false;
  }

  private async *executeToolCallsParallel(toolCalls: any[]): AsyncGenerator<StreamingEvent> {
    const tasks = toolCalls.map(async (toolCall) => {
      const events: StreamingEvent[] = [];
      for await (const event of this.executeToolCall(toolCall, { useEnv: false })) {
        events.push(event);
      }
      return events;
    });

    const settled = await Promise.all(tasks);
    for (const events of settled) {
      for (const event of events) {
        yield event;
      }
    }
  }

  private async *executeToolCall(
    toolCall: any,
    options: { useEnv?: boolean } = {}
  ): AsyncGenerator<StreamingEvent> {
    yield { type: 'tool_call', data: toolCall };

    if (!this.isToolAllowed(toolCall.name)) {
      yield {
        type: 'tool_output',
        data: { id: toolCall.id, error: `Tool not allowed: ${toolCall.name}` },
      };
      this.messages.push({
        role: 'tool',
        content: `Error: Tool not allowed: ${toolCall.name}`,
        toolCallId: toolCall.id,
      });
      return;
    }

    if (this.isToolRateLimited(toolCall.name)) {
      yield {
        type: 'tool_output',
        data: { id: toolCall.id, error: `Tool rate limit exceeded: ${toolCall.name}` },
      };
      this.messages.push({
        role: 'tool',
        content: `Error: Tool rate limit exceeded: ${toolCall.name}`,
        toolCallId: toolCall.id,
      });
      return;
    }

    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      yield {
        type: 'tool_output',
        data: { id: toolCall.id, error: `Tool not found: ${toolCall.name}` },
      };
      this.messages.push({
        role: 'tool',
        content: `Error: Tool not found: ${toolCall.name}`,
        toolCallId: toolCall.id,
      });
      return;
    }

    const useEnv = options.useEnv !== false;
    const env = process.env;
    const prevSession = env.KIGO_SESSION_ID;
    const prevToolCallId = env.KIGO_TOOL_CALL_ID;
    const prevToolName = env.KIGO_TOOL_NAME;
    const prevSubAgentDepth = env.KIGO_SUB_AGENT_DEPTH;

    if (useEnv) {
      if (this.options.sessionId) {
        env.KIGO_SESSION_ID = this.options.sessionId;
      }
      if (toolCall.id) {
        env.KIGO_TOOL_CALL_ID = toolCall.id;
      }
      if (toolCall.name) {
        env.KIGO_TOOL_NAME = toolCall.name;
      }
      if (this.subAgentDepth !== undefined) {
        env.KIGO_SUB_AGENT_DEPTH = String(this.subAgentDepth);
      }
    }

    try {
      let args: any;
      try {
        args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
      } catch (error) {
        throw new Error(`Invalid tool arguments for ${toolCall.name}: ${String(error)}`);
      }

      const result = await tool.execute(args);
      yield { type: 'tool_output', data: { id: toolCall.id, result } };
      this.messages.push({
        role: 'tool',
        content: result,
        toolCallId: toolCall.id,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      yield { type: 'tool_output', data: { id: toolCall.id, error: errorMsg } };
      this.messages.push({
        role: 'tool',
        content: `Error: ${errorMsg}`,
        toolCallId: toolCall.id,
      });
    } finally {
      if (useEnv) {
        if (prevSession === undefined) {
          delete env.KIGO_SESSION_ID;
        } else {
          env.KIGO_SESSION_ID = prevSession;
        }
        if (prevToolCallId === undefined) {
          delete env.KIGO_TOOL_CALL_ID;
        } else {
          env.KIGO_TOOL_CALL_ID = prevToolCallId;
        }
        if (prevToolName === undefined) {
          delete env.KIGO_TOOL_NAME;
        } else {
          env.KIGO_TOOL_NAME = prevToolName;
        }
        if (prevSubAgentDepth === undefined) {
          delete env.KIGO_SUB_AGENT_DEPTH;
        } else {
          env.KIGO_SUB_AGENT_DEPTH = prevSubAgentDepth;
        }
      }
    }
  }

  getMessages(): Message[] {
    return this.messages;
  }

  loadMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  reset(): void {
    this.messages = [];
  }

  setSystemPrompt(prompt: string): void {
    this.options.systemPrompt = prompt;
  }

  getSystemPrompt(): string {
    return this.options.systemPrompt;
  }
}
