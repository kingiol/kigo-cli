/**
 * Configuration schemas using Zod
 */

import { z } from 'zod';

const DEFAULT_MODEL_CONFIG = {
  name: 'gpt-4o',
  provider: 'openai',
} as const;

const DEFAULT_CLI_CONFIG = {
  stream: true,
} as const;

const DEFAULT_SKILLS_CONFIG = {
  enabled: true,
  projectSkillsDir: '.kigo/skills',
  userSkillsDir: '~/.kigo/skills',
} as const;

const DEFAULT_TOOLS_CONFIG = {
  loadPaths: ['.kigo/tool', '.kigo/tools', '.opencode/tool', '.opencode/tools'] as string[],
  timeoutMs: 120000,
  maxOutputChars: 12000,
};

const DEFAULT_PERMISSIONS_CONFIG: {
  allow: string[];
  block: string[];
  dontAsk: boolean;
  auditLogPath: string;
} = {
  allow: [],
  block: [],
  dontAsk: false,
  auditLogPath: '~/.kigo/permission-audit.log',
};

// Model configuration
export const ModelConfigSchema = z.object({
  name: z.string().default('gpt-4o'),
  provider: z.string().default('openai'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  azureApiVersion: z.string().optional(),
  vertexAiLocation: z.string().optional(),
  vertexAiCredentialsPath: z.string().optional(),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high']).optional(),
});

export const ProviderEntrySchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  azureApiVersion: z.string().optional(),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high']).optional(),
  options: z.record(z.string(), z.any()).default({}),
});

export const ProvidersConfigSchema = z.record(z.string(), ProviderEntrySchema).default({});

export const AgentProfileSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(['primary', 'subagent', 'all']).optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().int().positive().optional(),
  steps: z.number().int().positive().optional(),
  readOnly: z.boolean().optional(),
  allowedTools: z.array(z.string()).default([]),
  blockedTools: z.array(z.string()).default([]),
  disable: z.boolean().default(false),
});

export const AgentsConfigSchema = z.record(z.string(), AgentProfileSchema).default({});

export const PluginConfigSchema = z.object({
  name: z.string(),
  source: z.enum(['file', 'npm']).default('npm'),
  spec: z.string(),
  enabled: z.boolean().default(true),
  options: z.record(z.string(), z.any()).default({}),
});

export const PluginsConfigSchema = z
  .array(z.union([z.string(), PluginConfigSchema]))
  .default([]);

export const ToolsConfigSchema = z.object({
  loadPaths: z.array(z.string()).default(DEFAULT_TOOLS_CONFIG.loadPaths),
  timeoutMs: z.number().int().min(1).default(DEFAULT_TOOLS_CONFIG.timeoutMs),
  maxOutputChars: z.number().int().min(256).default(DEFAULT_TOOLS_CONFIG.maxOutputChars),
});

// CLI configuration
export const CLIConfigSchema = z.object({
  session: z.string().optional(),
  stream: z.boolean().default(true),
});

// MCP server configuration
export const MCPServerConfigSchema = z.object({
  name: z.string(),
  transportType: z.enum(['stdio', 'sse', 'http']).default('stdio'),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  envVars: z.record(z.string(), z.string()).default({}),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).default({}),
  cacheToolsList: z.boolean().default(true),
  allowedTools: z.array(z.string()).optional(),
  blockedTools: z.array(z.string()).optional(),
});

// Skills configuration
export const SkillsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  projectSkillsDir: z.string().default('.kigo/skills'),
  userSkillsDir: z.string().default('~/.kigo/skills'),
});

// Permissions configuration
export const PermissionsConfigSchema = z.object({
  allow: z.array(z.string()).default([]),
  block: z.array(z.string()).default([]),
  dontAsk: z.boolean().default(false),
  auditLogPath: z.string().default('~/.kigo/permission-audit.log'),
});

// Main Kigo configuration
export const KigoConfigSchema = z.object({
  model: ModelConfigSchema.default(DEFAULT_MODEL_CONFIG),
  providers: ProvidersConfigSchema.default({}),
  agent: AgentsConfigSchema.default({}),
  cli: CLIConfigSchema.default(DEFAULT_CLI_CONFIG),
  mcpServers: z.array(MCPServerConfigSchema).default([]),
  skills: SkillsConfigSchema.default(DEFAULT_SKILLS_CONFIG),
  plugins: PluginsConfigSchema.default([]),
  tools: ToolsConfigSchema.default(DEFAULT_TOOLS_CONFIG),
  permissions: PermissionsConfigSchema.default(DEFAULT_PERMISSIONS_CONFIG),
}).default({
  model: DEFAULT_MODEL_CONFIG,
  providers: {},
  agent: {},
  cli: DEFAULT_CLI_CONFIG,
  mcpServers: [],
  skills: DEFAULT_SKILLS_CONFIG,
  plugins: [],
  tools: DEFAULT_TOOLS_CONFIG,
  permissions: DEFAULT_PERMISSIONS_CONFIG,
});

// Export types
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;
export type ProvidersConfig = z.infer<typeof ProvidersConfigSchema>;
export type AgentProfileConfig = z.infer<typeof AgentProfileSchema>;
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;
export type CLIConfig = z.infer<typeof CLIConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type PluginsConfig = z.infer<typeof PluginsConfigSchema>;
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
export type KigoConfig = z.infer<typeof KigoConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: KigoConfig = {
  model: DEFAULT_MODEL_CONFIG,
  providers: {},
  agent: {},
  cli: DEFAULT_CLI_CONFIG,
  mcpServers: [],
  skills: DEFAULT_SKILLS_CONFIG,
  plugins: [],
  tools: DEFAULT_TOOLS_CONFIG,
  permissions: DEFAULT_PERMISSIONS_CONFIG,
};
