/**
 * Core types for Kigo Node.js
 */

export interface Tool {
  name: string;
  description: string;
  parameters: any; // Zod schema
  execute: (params: any) => Promise<string>;
}

export interface StreamingEvent {
  type: 'text_delta' | 'tool_call' | 'tool_output' | 'done' | 'error';
  data: any;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  requestCount: number;
  lastInputTokens: number;
  lastOutputTokens: number;
  currentContextTokens: number;
}

export interface ModelCosts {
  inputCostPer1k: number;
  outputCostPer1k: number;
}

export interface ModelInfo {
  contextWindow: number;
  maxOutputTokens: number;
  costs?: ModelCosts;
}
