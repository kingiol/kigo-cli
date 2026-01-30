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

// Main Kigo configuration
export const KigoConfigSchema = z.object({
  model: ModelConfigSchema.default(DEFAULT_MODEL_CONFIG),
  cli: CLIConfigSchema.default(DEFAULT_CLI_CONFIG),
  mcpServers: z.array(MCPServerConfigSchema).default([]),
  skills: SkillsConfigSchema.default(DEFAULT_SKILLS_CONFIG),
}).default({
  model: DEFAULT_MODEL_CONFIG,
  cli: DEFAULT_CLI_CONFIG,
  mcpServers: [],
  skills: DEFAULT_SKILLS_CONFIG,
});

// Export types
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type CLIConfig = z.infer<typeof CLIConfigSchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;
export type KigoConfig = z.infer<typeof KigoConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: KigoConfig = {
  model: DEFAULT_MODEL_CONFIG,
  cli: DEFAULT_CLI_CONFIG,
  mcpServers: [],
  skills: DEFAULT_SKILLS_CONFIG,
};
