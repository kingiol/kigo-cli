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
}

export class Agent {
  private tools: Map<string, Tool> = new Map();
  private messages: Message[] = [];
  private maxTokens: number;
  private temperature: number;

  constructor(private options: AgentOptions) {
    this.maxTokens = options.maxTokens || 4096;
    this.temperature = options.temperature || 0.7;

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
    this.messages.push({ role: 'user', content: input });

    const fullMessages = [
      { role: 'system' as const, content: this.options.systemPrompt },
      ...this.messages,
    ];

    try {
      const response = await this.options.provider.chat({
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
      });

      let currentContent = '';
      let currentToolCalls: any[] = [];

      for await (const chunk of response) {
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

        // Tool calls complete
        if (chunk.finish_reason === 'tool_calls' && currentToolCalls.length > 0) {
          this.messages.push({
            role: 'assistant',
            content: currentContent,
            toolCalls: currentToolCalls,
          });

          for (const toolCall of currentToolCalls) {
            yield { type: 'tool_call', data: toolCall };

            const tool = this.tools.get(toolCall.name);
            if (!tool) {
              yield {
                type: 'tool_output',
                data: { id: toolCall.id, error: `Tool not found: ${toolCall.name}` },
              };
              continue;
            }

            const args = JSON.parse(toolCall.arguments);
            const env = process.env;
            const prevSession = env.KIGO_SESSION_ID;
            const prevToolCallId = env.KIGO_TOOL_CALL_ID;
            const prevToolName = env.KIGO_TOOL_NAME;

            if (this.options.sessionId) {
              env.KIGO_SESSION_ID = this.options.sessionId;
            }
            if (toolCall.id) {
              env.KIGO_TOOL_CALL_ID = toolCall.id;
            }
            if (toolCall.name) {
              env.KIGO_TOOL_NAME = toolCall.name;
            }

            try {
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
            }
          }

          // Continue conversation
          yield* this.run('');
          return;
        }

        // Conversation complete
        if (chunk.finish_reason === 'stop') {
          this.messages.push({ role: 'assistant', content: currentContent });
          yield { type: 'done', data: { usage: chunk.usage } };
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      yield { type: 'error', data: errorMsg };
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
