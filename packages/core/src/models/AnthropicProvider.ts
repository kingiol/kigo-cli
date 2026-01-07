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
    const systemMessage = options.messages.find(m => m.role === 'system');
    const messages = options.messages.filter(m => m.role !== 'system');

    const stream = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: systemMessage?.content,
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
    const systemMessage = options.messages.find(m => m.role === 'system');
    const messages = options.messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: systemMessage?.content,
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
}