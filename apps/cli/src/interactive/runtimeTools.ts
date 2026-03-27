import type { Tool as RuntimeTool } from "@kigo/tools";
import type { LoadedExternalTool, PluginExecutionContext } from "@kigo/plugin";

export function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) {
    return output;
  }
  return `${output.slice(0, maxChars)}\n\n[output truncated at ${maxChars} chars]`;
}

export async function runWithTimeout<T>(task: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return task;
  }

  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return (await Promise.race([task, timeout])) as T;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function wrapExternalTool(
  tool: LoadedExternalTool,
  context: PluginExecutionContext,
  defaultTimeoutMs: number,
  maxOutputChars: number,
): RuntimeTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (params: unknown): Promise<string> => {
      const result = await runWithTimeout(
        tool.execute(params, context),
        tool.timeoutMs || defaultTimeoutMs,
      );
      return truncateOutput(result, maxOutputChars);
    },
  };
}
