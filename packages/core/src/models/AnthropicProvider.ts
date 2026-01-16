/**
 * Anthropic provider implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  BaseProvider,
  type ChatOptions,
  type ChatResponse,
  type StreamChunk,
} from './BaseProvider.js';
import type { Message } from '../types.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(options: AnthropicProviderOptions) {
    super();
    this.client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
    this.defaultModel = options.model || 'claude-sonnet-4-20250514';
  }

  async *chat(options: ChatOptions): AsyncIterable<StreamChunk> {
    const { system, messages } = this.formatAnthropicMessages(options.messages);

    const stream = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages,
      system,
      tools: options.tools?.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
      stream: true,
    });

    let currentToolCall: any = null;
    let currentArgs = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { delta: { content: event.delta.text } };
        } else if (event.delta.type === 'input_json_delta') {
          // Handle tool call delta
          if (currentToolCall) {
            currentArgs += event.delta.partial_json;
          }
        }
      } else if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block && block.type === 'tool_use') {
          currentToolCall = {
            id: block.id,
            name: block.name,
            arguments: '',
          };
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolCall) {
          currentToolCall.arguments = currentArgs;
          yield {
            delta: {
              tool_calls: [
                {
                  id: currentToolCall.id,
                  name: currentToolCall.name,
                  arguments: currentToolCall.arguments,
                },
              ],
            },
          };
          currentToolCall = null;
          currentArgs = '';
        }
      } else if (event.type === 'message_stop') {
        yield { finish_reason: 'stop' };
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          const input = event.usage.input_tokens ?? 0;
          const output = event.usage.output_tokens ?? 0;
          yield {
            usage: {
              inputTokens: input,
              outputTokens: output,
              totalTokens: input + output,
            },
          };
        }
      }
    }
  }

  async chatNonStream(options: ChatOptions): Promise<ChatResponse> {
    const { system, messages } = this.formatAnthropicMessages(options.messages);

    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages,
      system,
      tools: options.tools?.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
    });

    const content = response.content[0];
    const toolCalls: any[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }

    return {
      content: content.type === 'text' ? content.text : '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: response.stop_reason || 'stop',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private formatAnthropicMessages(messages: Message[]): {
    system?: string;
    messages: Anthropic.Messages.MessageParam[];
  } {
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content).filter(Boolean);
    const system = systemParts.length > 0 ? systemParts.join('\n') : undefined;

    const formatted: Anthropic.Messages.MessageParam[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        continue;
      }

      if (message.role === 'tool') {
        if (message.toolCallId) {
          formatted.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: message.toolCallId,
                content: message.content,
              },
            ],
          });
        } else {
          formatted.push({
            role: 'user',
            content: message.content,
          });
        }
        continue;
      }

      if (message.role === 'assistant' && message.toolCalls?.length) {
        const contentBlocks: Anthropic.Messages.ContentBlock[] = [];
        if (message.content) {
          contentBlocks.push({ type: 'text', text: message.content, citations: [] });
        }
        for (const toolCall of message.toolCalls) {
          let input: any = {};
          if (toolCall.arguments) {
            try {
              input = JSON.parse(toolCall.arguments);
            } catch {
              input = { raw: toolCall.arguments };
            }
          }
          contentBlocks.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input,
          });
        }
        formatted.push({
          role: 'assistant',
          content: contentBlocks,
        });
        continue;
      }

      formatted.push({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      });
    }

    return { system, messages: formatted };
  }
}
