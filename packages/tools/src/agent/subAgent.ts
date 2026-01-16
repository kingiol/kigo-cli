/**
 * Sub-agent tool registration
 */

import { z } from 'zod';
import type { SubAgentManager } from '@kigo/core';
import { registry } from '../registry.js';

export const SUB_AGENT_TOOL_NAME = 'sub_agent_run';

export const subAgentSchema = z.object({
  task: z.string().min(1),
  context: z.string().optional(),
  profile: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  blockedTools: z.array(z.string()).optional(),
  maxTokens: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeoutMs: z.number().int().min(1).optional(),
  maxRetries: z.number().int().min(0).optional(),
  retryDelayMs: z.number().int().min(0).optional(),
  parallelToolCalls: z.boolean().optional(),
  toolChoice: z.any().optional(),
  responseFormat: z.any().optional(),
  toolRateLimit: z
    .object({
      maxCalls: z.number().int().min(1),
      windowMs: z.number().int().min(1),
    })
    .optional(),
  allowNested: z.boolean().default(false),
  returnEvents: z.boolean().default(false),
});

export interface SubAgentToolOptions {
  allowNestedDefault?: boolean;
}

export function registerSubAgentTool(
  getManager: () => SubAgentManager | null,
  options: SubAgentToolOptions = {}
): void {
  if (registry.has(SUB_AGENT_TOOL_NAME)) {
    return;
  }

  registry.register({
    name: SUB_AGENT_TOOL_NAME,
    description: 'Run a specialized sub-agent to handle a sub-task.',
    schema: subAgentSchema,
    execute: async (params) => {
      const manager = getManager();
      if (!manager) {
        throw new Error('Sub-agent manager not initialized');
      }

      const allowNested = params.allowNested ?? options.allowNestedDefault ?? false;
      const parentDepth = Number(process.env.KIGO_SUB_AGENT_DEPTH || 0);
      const nextDepth = parentDepth + 1;
      const blockedTools = allowNested
        ? params.blockedTools
        : [...(params.blockedTools || []), SUB_AGENT_TOOL_NAME];

      const result = await manager.runSubAgent({
        task: params.task,
        context: params.context,
        profileId: params.profile,
        systemPrompt: params.systemPrompt,
        model: params.model,
        tools: params.tools,
        allowedTools: params.allowedTools,
        blockedTools,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        timeoutMs: params.timeoutMs,
        maxRetries: params.maxRetries,
        retryDelayMs: params.retryDelayMs,
        parallelToolCalls: params.parallelToolCalls,
        toolChoice: params.toolChoice,
        responseFormat: params.responseFormat,
        toolRateLimit: params.toolRateLimit,
        depth: nextDepth,
        returnEvents: params.returnEvents,
      });

      return JSON.stringify({
        output: result.output,
        usage: result.usage,
        durationMs: result.durationMs,
        events: result.events,
      });
    },
  });
}
