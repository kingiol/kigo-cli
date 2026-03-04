import type { ZodTypeAny } from "zod";

export type PluginSource = "file" | "npm";

export interface PluginExecutionContext {
  cwd: string;
  sessionId?: string;
  env: NodeJS.ProcessEnv;
}

export interface PluginToolDefinition {
  description: string;
  schema?: ZodTypeAny;
  parameters?: Record<string, unknown>;
  timeoutMs?: number;
  execute: (args: unknown, context: PluginExecutionContext) => Promise<unknown> | unknown;
}

export interface KigoPlugin {
  name: string;
  tools?: Record<string, PluginToolDefinition>;
  hooks?: Record<string, (...args: unknown[]) => unknown>;
  config?: (config: unknown) => unknown;
}

export interface PluginEntry {
  name: string;
  source: PluginSource;
  spec: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface LoadedExternalTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  timeoutMs?: number;
  source: "plugin" | "local";
  origin: string;
  execute: (params: unknown, context: PluginExecutionContext) => Promise<string>;
}
