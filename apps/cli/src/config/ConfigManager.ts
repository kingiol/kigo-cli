/**
 * Configuration manager for loading and managing Kigo configuration
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import {
  KigoConfigSchema,
  DEFAULT_CONFIG,
  type KigoConfig,
  type MCPServerConfig,
} from './configSchema.js';

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.kigo', 'config.yaml');

export class ConfigManager {
  private configPath: string;
  private config: KigoConfig | null = null;
  private lastModified: number = 0;

  constructor(configPath?: string) {
    this.configPath = configPath || DEFAULT_CONFIG_PATH;
  }

  async load(): Promise<KigoConfig> {
    try {
      const stat = await fs.stat(this.configPath);
      if (stat.mtimeMs > this.lastModified || !this.config) {
        await this.reload();
      }
    } catch {
      // File doesn't exist, use default
      if (!this.config) {
        this.config = DEFAULT_CONFIG;
      }
    }

    return this.config!;
  }

  private async reload(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = yaml.load(content) as any;
      this.config = KigoConfigSchema.parse(parsed);
      this.lastModified = (await fs.stat(this.configPath)).mtimeMs;
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.warn(`Failed to load config from ${this.configPath}: ${error}`);
      }
      this.config = DEFAULT_CONFIG;
    }
  }

  async save(config: KigoConfig): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    // Validate before saving
    const validated = KigoConfigSchema.parse(config);

    const content = yaml.dump(validated, { indent: 2, lineWidth: 120 });
    await fs.writeFile(this.configPath, content, 'utf-8');

    this.config = validated;
    this.lastModified = Date.now();
  }

  get<K extends keyof KigoConfig>(key: K): KigoConfig[K] {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config[key];
  }

  getEffectiveValue<T>(
    configValue: T,
    envVarName: string | null,
    cliValue: T | undefined
  ): T {
    if (cliValue !== undefined) return cliValue;
    if (envVarName) {
      const envValue = process.env[envVarName];
      if (envValue !== undefined) {
        return envValue as unknown as T;
      }
    }
    return configValue;
  }

  getModelName(cliModel?: string): string {
    const envModel = process.env.KIGO_MODEL;
    return cliModel || envModel || this.config?.model.name || 'gpt-4o';
  }

  getProvider(): string {
    const model = this.getModelName();

    // Handle provider/model format
    if (model.includes('/')) {
      const parts = model.split('/');
      return parts[0];
    }

    return this.config?.model.provider || 'openai';
  }

  getBaseModel(): string {
    const model = this.getModelName();

    // Handle provider/model format
    if (model.includes('/')) {
      const parts = model.split('/');
      return parts.slice(1).join('/');
    }

    return model;
  }

  getApiKey(): string | undefined {
    const provider = this.getProvider();
    const envVarMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      gemini: 'GEMINI_API_KEY',
      azure: 'AZURE_API_KEY',
      cohere: 'COHERE_API_KEY',
      replicate: 'REPLICATE_API_TOKEN',
      huggingface: 'HUGGINGFACE_API_KEY',
      together_ai: 'TOGETHERAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      deepinfra: 'DEEPINFRA_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      perplexity: 'PERPLEXITYAI_API_KEY',
      fireworks_ai: 'FIREWORKS_AI_API_KEY',
      cloudflare: 'CLOUDFLARE_API_KEY',
      ollama: 'OLLAMA_BASE_URL',
    };

    const envVar = envVarMap[provider];
    if (envVar) {
      return process.env[envVar];
    }

    return this.config?.model.apiKey;
  }

  getBaseUrl(): string | undefined {
    const provider = this.getProvider();
    const envVarMap: Record<string, string> = {
      openai: 'OPENAI_BASE_URL',
      anthropic: 'ANTHROPIC_BASE_URL',
      azure: 'AZURE_API_BASE',
      cohere: 'COHERE_API_BASE',
    };

    const envVar = envVarMap[provider];
    if (envVar) {
      return process.env[envVar];
    }

    return this.config?.model.baseUrl;
  }

  getReasoningEffort(): string | undefined {
    const envEffort = process.env.KIGO_REASONING_EFFORT;
    return envEffort || this.config?.model.reasoningEffort;
  }

  async getMCPServers(): Promise<MCPServerConfig[]> {
    await this.load();
    return this.config?.mcpServers || [];
  }

  async addMCPServer(serverConfig: MCPServerConfig): Promise<void> {
    await this.load();
    const existingIndex = this.config!.mcpServers.findIndex(
      s => s.name === serverConfig.name
    );

    if (existingIndex >= 0) {
      this.config!.mcpServers[existingIndex] = serverConfig;
    } else {
      this.config!.mcpServers.push(serverConfig);
    }

    await this.save(this.config!);
  }

  async removeMCPServer(name: string): Promise<boolean> {
    await this.load();
    const index = this.config!.mcpServers.findIndex(s => s.name === name);

    if (index < 0) {
      return false;
    }

    this.config!.mcpServers.splice(index, 1);
    await this.save(this.config!);
    return true;
  }

  getPath(): string {
    return this.configPath;
  }

  async ensureConfigDirectory(): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
  }
}

// Singleton instance
let configManager: ConfigManager | null = null;

export function getConfigManager(configPath?: string): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager(configPath);
  }
  return configManager;
}

export function resetConfigManager(): void {
  configManager = null;
}