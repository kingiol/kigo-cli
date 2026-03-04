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
  type PluginConfig,
  type ToolsConfig,
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
        this.config = this.buildDefaultConfig();
      }
    }

    return this.config!;
  }

  private buildDefaultConfig(): KigoConfig {
    return {
      ...DEFAULT_CONFIG,
      model: { ...DEFAULT_CONFIG.model },
      cli: { ...DEFAULT_CONFIG.cli },
      providers: { ...(DEFAULT_CONFIG.providers || {}) },
      agent: { ...(DEFAULT_CONFIG.agent || {}) },
      mcpServers: [...(DEFAULT_CONFIG.mcpServers || [])],
      skills: { ...DEFAULT_CONFIG.skills },
      plugins: [...(DEFAULT_CONFIG.plugins || [])],
      tools: { ...DEFAULT_CONFIG.tools },
      permissions: { ...DEFAULT_CONFIG.permissions },
    };
  }

  private normalizeConfig(raw: any): any {
    if (!raw || typeof raw !== 'object') {
      return this.buildDefaultConfig();
    }

    const normalized = { ...raw };
    normalized.providers = normalized.providers || {};
    normalized.agent = normalized.agent || {};
    normalized.plugins = normalized.plugins || [];
    normalized.tools = normalized.tools || {};

    const modelProvider = normalized.model?.provider;
    const providerModel = normalized.model?.name;
    const providerApiKey = normalized.model?.apiKey;
    const providerBaseUrl = normalized.model?.baseUrl;
    const providerAzureApiVersion = normalized.model?.azureApiVersion;
    const providerReasoningEffort = normalized.model?.reasoningEffort;

    if (modelProvider) {
      const existing = normalized.providers[modelProvider] || {};
      normalized.providers[modelProvider] = {
        ...existing,
        apiKey: existing.apiKey ?? providerApiKey,
        baseUrl: existing.baseUrl ?? providerBaseUrl,
        model: existing.model ?? providerModel,
        azureApiVersion: existing.azureApiVersion ?? providerAzureApiVersion,
        reasoningEffort: existing.reasoningEffort ?? providerReasoningEffort,
        options: existing.options || {},
      };
    }

    normalized.plugins = normalized.plugins.map((entry: unknown) => {
      if (typeof entry === 'string') {
        const name = entry.includes('/') ? entry.split('/').pop() || entry : entry;
        return {
          name,
          source: 'npm',
          spec: entry,
          enabled: true,
          options: {},
        };
      }
      return entry;
    });

    return normalized;
  }

  private async reload(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = yaml.load(content) as any;
      this.config = KigoConfigSchema.parse(this.normalizeConfig(parsed));
      this.lastModified = (await fs.stat(this.configPath)).mtimeMs;
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.warn(`Failed to load config from ${this.configPath}: ${error}`);
      }
      this.config = this.buildDefaultConfig();
    }
  }

  async save(config: KigoConfig): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    // Validate before saving
    const validated = KigoConfigSchema.parse(this.normalizeConfig(config));

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
    const provider = this.getProvider();
    const providerModel = this.config?.providers?.[provider]?.model;
    return cliModel || envModel || providerModel || this.config?.model.name || 'gpt-4o';
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

  getProviderEntry(provider?: string): Record<string, any> {
    const currentProvider = provider || this.getProvider();
    const direct = this.config?.providers?.[currentProvider];
    if (direct) {
      return direct;
    }
    const openAICompatibleAliases = new Set([
      'openrouter',
      'together_ai',
      'deepinfra',
      'groq',
      'mistral',
      'perplexity',
      'fireworks_ai',
      'cloudflare',
      'ollama',
    ]);
    if (openAICompatibleAliases.has(currentProvider)) {
      return this.config?.providers?.['openai-compatible'] || {};
    }
    return {};
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
      ollama: '',
      'openai-compatible': '',
    };

    const envVar = envVarMap[provider];
    if (envVar) {
      return process.env[envVar];
    }

    const providerEntry = this.getProviderEntry(provider);
    if (providerEntry.apiKey) {
      return providerEntry.apiKey;
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
      openrouter: 'OPENROUTER_BASE_URL',
      together_ai: 'TOGETHERAI_BASE_URL',
      deepinfra: 'DEEPINFRA_BASE_URL',
      groq: 'GROQ_BASE_URL',
      mistral: 'MISTRAL_BASE_URL',
      perplexity: 'PERPLEXITYAI_BASE_URL',
      fireworks_ai: 'FIREWORKS_AI_BASE_URL',
      cloudflare: 'CLOUDFLARE_BASE_URL',
      ollama: 'OLLAMA_BASE_URL',
      'openai-compatible': '',
    };

    const envVar = envVarMap[provider];
    if (envVar) {
      return process.env[envVar];
    }

    const providerEntry = this.getProviderEntry(provider);
    if (providerEntry.baseUrl) {
      return providerEntry.baseUrl;
    }
    return this.config?.model.baseUrl;
  }

  getAzureApiVersion(): string | undefined {
    const envVersion = process.env.AZURE_API_VERSION;
    return envVersion || this.getProviderEntry('azure').azureApiVersion || this.config?.model.azureApiVersion;
  }

  getReasoningEffort(): string | undefined {
    const envEffort = process.env.KIGO_REASONING_EFFORT;
    const provider = this.getProvider();
    return envEffort || this.getProviderEntry(provider).reasoningEffort || this.config?.model.reasoningEffort;
  }

  getProviderConfig(provider?: string): {
    provider: string;
    apiKey?: string;
    baseURL?: string;
    model?: string;
    azureApiVersion?: string;
    reasoningEffort?: string;
  } {
    const effectiveProvider = provider || this.getProvider();
    const entry = this.getProviderEntry(effectiveProvider);
    return {
      provider: effectiveProvider,
      apiKey: this.getApiKey(),
      baseURL: this.getBaseUrl(),
      model: entry.model || this.getBaseModel(),
      azureApiVersion: this.getAzureApiVersion(),
      reasoningEffort: this.getReasoningEffort(),
    };
  }

  getAgentOverrides(): Record<string, any> {
    return this.config?.agent || {};
  }

  getToolsConfig(): ToolsConfig {
    return this.config?.tools || DEFAULT_CONFIG.tools;
  }

  getToolLoadPaths(): string[] {
    return this.getToolsConfig().loadPaths || DEFAULT_CONFIG.tools.loadPaths;
  }

  getPlugins(): PluginConfig[] {
    const plugins = this.config?.plugins || [];
    const normalized: PluginConfig[] = [];
    for (const plugin of plugins) {
      if (typeof plugin === 'string') {
        normalized.push({
          name: plugin.includes('/') ? plugin.split('/').pop() || plugin : plugin,
          source: 'npm',
          spec: plugin,
          enabled: true,
          options: {},
        });
        continue;
      }
      normalized.push({
        name: plugin.name,
        source: plugin.source || 'npm',
        spec: plugin.spec,
        enabled: plugin.enabled ?? true,
        options: plugin.options || {},
      });
    }
    return normalized;
  }

  async addPlugin(plugin: PluginConfig): Promise<void> {
    await this.load();
    const plugins = this.getPlugins();
    const idx = plugins.findIndex((entry) => entry.name === plugin.name);
    if (idx >= 0) {
      plugins[idx] = plugin;
    } else {
      plugins.push(plugin);
    }
    this.config!.plugins = plugins;
    await this.save(this.config!);
  }

  async removePlugin(name: string): Promise<boolean> {
    await this.load();
    const plugins = this.getPlugins();
    const next = plugins.filter((entry) => entry.name !== name && entry.spec !== name);
    if (next.length === plugins.length) {
      return false;
    }
    this.config!.plugins = next;
    await this.save(this.config!);
    return true;
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

export function getDefaultConfigPath(configPath?: string): string {
  return configPath || DEFAULT_CONFIG_PATH;
}
