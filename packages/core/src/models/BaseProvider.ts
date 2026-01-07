/**
 * Base provider interface for LLM providers
 */

import type { Message, Usage } from '../types.js';

export interface ChatOptions {
  messages: Message[];
  tools?: any[];
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: string;
}

export interface ChatResponse {
  content: string;
  toolCalls?: any[];
  finishReason: string;
  usage?: Usage;
}

export interface StreamChunk {
  delta?: {
    content?: string;
    tool_calls?: any[];
  };
  finish_reason?: string;
  usage?: Usage;
}

export abstract class BaseProvider {
  abstract chat(options: ChatOptions): AsyncIterable<StreamChunk>;
  abstract chatNonStream(options: ChatOptions): Promise<ChatResponse>;

  protected formatMessages(messages: Message[]): any[] {
    return messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_call_id: m.toolCallId,
      tool_calls: m.toolCalls?.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
    }));
  }
}