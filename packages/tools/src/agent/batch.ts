/**
 * Batch tool - execute multiple independent tool calls concurrently
 */

import { z } from 'zod';
import { registry, tool } from '../registry.js';

const MAX_BATCH_TOOLS = 25;
const MAX_SINGLE_OUTPUT = 4000;
const DISALLOWED = new Set([
  'batch',
  'run_shell',
  'write_file',
  'edit_file',
  'apply_patch',
  'multiedit',
  'sub_agent_run',
]);

const batchCallSchema = z.object({
  tool: z.string().min(1).describe('Tool name to execute'),
  parameters: z.record(z.any()).default({}).describe('Tool parameters'),
});

export const batchSchema = z.union([
  z.array(batchCallSchema).min(1).max(MAX_BATCH_TOOLS),
  z.object({
    tool_calls: z.array(batchCallSchema).min(1).max(MAX_BATCH_TOOLS),
  }),
]);

function truncate(output: string): string {
  if (output.length <= MAX_SINGLE_OUTPUT) {
    return output;
  }
  return `${output.slice(0, MAX_SINGLE_OUTPUT)}\n... output truncated`;
}

tool({
  name: 'batch',
  description:
    'Execute multiple independent tool calls in parallel. Input can be [{tool, parameters}] or {tool_calls:[...]}.',
  schema: batchSchema,
  execute: async (input) => {
    const calls = Array.isArray(input) ? input : input.tool_calls;
    const availableTools = new Set(registry.getNames());

    const results = await Promise.all(
      calls.map(async (call) => {
        if (DISALLOWED.has(call.tool)) {
          return {
            tool: call.tool,
            success: false,
            output: `Tool '${call.tool}' is not allowed in batch`,
          };
        }

        if (!availableTools.has(call.tool)) {
          return {
            tool: call.tool,
            success: false,
            output: `Tool '${call.tool}' not found`,
          };
        }

        const target = registry.get(call.tool);
        if (!target) {
          return {
            tool: call.tool,
            success: false,
            output: `Tool '${call.tool}' not found`,
          };
        }

        try {
          const output = await target.execute(call.parameters || {});
          return {
            tool: call.tool,
            success: true,
            output: truncate(output),
          };
        } catch (error) {
          return {
            tool: call.tool,
            success: false,
            output: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const successCount = results.filter((result) => result.success).length;
    const lines: string[] = [`Batch execution: ${successCount}/${results.length} successful`];

    for (const result of results) {
      lines.push('');
      lines.push(`[${result.success ? 'ok' : 'error'}] ${result.tool}`);
      lines.push(result.output);
    }

    return lines.join('\n');
  },
});
