/**
 * OpenAI provider implementation
 */

import OpenAI from 'openai';
import {
  BaseProvider,
  type ChatOptions,
  type ChatResponse,
  type StreamChunk,
} from './BaseProvider.js';

export interface OpenAIProviderOptions {
  apiKey: string;
  baseURL?: string;
  model?: string;
  defaultHeaders?: Record<string, string>;
  defaultQuery?: Record<string, string>;
}

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(options: OpenAIProviderOptions) {
    super();
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      defaultHeaders: options.defaultHeaders,
      defaultQuery: options.defaultQuery,
    });
    this.defaultModel = options.model || 'gpt-4o';
  }

  async *chat(options: ChatOptions): AsyncIterable<StreamChunk> {
    const model = this.getModel(options);

    const stream = await this.client.chat.completions.create({
      model,
      messages: this.formatMessages(options.messages),
      tools: options.tools,
      tool_choice: options.toolChoice,
      stream: true,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      response_format: options.responseFormat,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      yield {
        delta: {
          content: delta?.content ?? undefined,
          tool_calls: delta?.tool_calls?.map((tc: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall) => ({
            id: tc.id,
            index: tc.index,
            name: tc.function?.name,
            arguments: tc.function?.arguments ?? undefined,
          })),
        },
        finish_reason: chunk.choices[0]?.finish_reason ?? undefined,
        usage: chunk.usage
          ? {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          }
          : undefined,
      };
    }
  }

  async chatNonStream(options: ChatOptions): Promise<ChatResponse> {
    const model = this.getModel(options);

    const response = await this.client.chat.completions.create({
      model,
      messages: this.formatMessages(options.messages),
      tools: options.tools,
      tool_choice: options.toolChoice,
      stream: false,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      response_format: options.responseFormat,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      finishReason: choice.finish_reason || 'stop',
      usage: response.usage
        ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
        : undefined,
    };
  }

  private getModel(_options: ChatOptions): string {
    // Extract model from messages if present (for tool calls)
    return this.defaultModel;
  }
}
