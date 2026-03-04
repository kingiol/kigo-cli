import { AnthropicProvider } from "./AnthropicProvider.js";
import type { BaseProvider } from "./BaseProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import type { ProviderConfig } from "./ProviderFactory.js";

export type ProviderTransport = "openai" | "anthropic";

export interface ProviderCapabilityMetadata {
  tool_calling: boolean;
  json_output: boolean;
  reasoning_effort: boolean;
  response_api_mode: "chat_completions" | "responses" | "anthropic_messages" | "unknown";
}

export interface ProviderDescriptor {
  id: string;
  aliases: string[];
  transport: ProviderTransport;
  envApiKey?: string;
  envBaseURL?: string;
  requiresApiKey?: boolean;
  requiresBaseURL?: boolean;
  capabilities: ProviderCapabilityMetadata;
}

const OPENAI_COMPATIBLE_ALIASES = [
  "openai-compatible",
  "openrouter",
  "together_ai",
  "deepinfra",
  "groq",
  "mistral",
  "perplexity",
  "fireworks_ai",
  "cloudflare",
  "ollama",
];

const DESCRIPTORS: ProviderDescriptor[] = [
  {
    id: "openai",
    aliases: ["openai"],
    transport: "openai",
    envApiKey: "OPENAI_API_KEY",
    envBaseURL: "OPENAI_BASE_URL",
    requiresApiKey: true,
    capabilities: {
      tool_calling: true,
      json_output: true,
      reasoning_effort: true,
      response_api_mode: "chat_completions",
    },
  },
  {
    id: "anthropic",
    aliases: ["anthropic"],
    transport: "anthropic",
    envApiKey: "ANTHROPIC_API_KEY",
    envBaseURL: "ANTHROPIC_BASE_URL",
    requiresApiKey: true,
    capabilities: {
      tool_calling: true,
      json_output: false,
      reasoning_effort: false,
      response_api_mode: "anthropic_messages",
    },
  },
  {
    id: "azure",
    aliases: ["azure"],
    transport: "openai",
    envApiKey: "AZURE_API_KEY",
    envBaseURL: "AZURE_API_BASE",
    requiresApiKey: true,
    requiresBaseURL: true,
    capabilities: {
      tool_calling: true,
      json_output: true,
      reasoning_effort: true,
      response_api_mode: "chat_completions",
    },
  },
  {
    id: "openai-compatible",
    aliases: OPENAI_COMPATIBLE_ALIASES,
    transport: "openai",
    requiresApiKey: true,
    requiresBaseURL: true,
    capabilities: {
      tool_calling: true,
      json_output: true,
      reasoning_effort: false,
      response_api_mode: "chat_completions",
    },
  },
];

const API_KEY_ENV_BY_ALIAS: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  together_ai: "TOGETHERAI_API_KEY",
  deepinfra: "DEEPINFRA_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  perplexity: "PERPLEXITYAI_API_KEY",
  fireworks_ai: "FIREWORKS_AI_API_KEY",
  cloudflare: "CLOUDFLARE_API_KEY",
};

const BASE_URL_ENV_BY_ALIAS: Record<string, string> = {
  openrouter: "OPENROUTER_BASE_URL",
  together_ai: "TOGETHERAI_BASE_URL",
  deepinfra: "DEEPINFRA_BASE_URL",
  groq: "GROQ_BASE_URL",
  mistral: "MISTRAL_BASE_URL",
  perplexity: "PERPLEXITYAI_BASE_URL",
  fireworks_ai: "FIREWORKS_AI_BASE_URL",
  cloudflare: "CLOUDFLARE_BASE_URL",
  ollama: "OLLAMA_BASE_URL",
};

function normalizeProviderId(provider: string): string {
  return provider.trim().toLowerCase();
}

function isGpt5OrLater(model: string | undefined): boolean {
  if (!model) return false;
  const matched = /^gpt-(\d+)/.exec(model);
  if (!matched) return false;
  return Number(matched[1]) >= 5;
}

export class ProviderRegistry {
  static list(): ProviderDescriptor[] {
    return DESCRIPTORS.map((descriptor) => ({ ...descriptor }));
  }

  static resolveProviderId(provider: string): string {
    const normalized = normalizeProviderId(provider);
    for (const descriptor of DESCRIPTORS) {
      if (descriptor.aliases.includes(normalized)) {
        return descriptor.id;
      }
    }
    return normalized;
  }

  static getDescriptor(provider: string): ProviderDescriptor | undefined {
    const normalized = normalizeProviderId(provider);
    for (const descriptor of DESCRIPTORS) {
      if (descriptor.aliases.includes(normalized) || descriptor.id === normalized) {
        return descriptor;
      }
    }
    return undefined;
  }

  static getEnvApiKeyVar(provider: string): string | undefined {
    const normalized = normalizeProviderId(provider);
    const descriptor = this.getDescriptor(normalized);
    if (!descriptor) return undefined;
    if (descriptor.id === "openai-compatible") {
      return API_KEY_ENV_BY_ALIAS[normalized];
    }
    return descriptor.envApiKey;
  }

  static getEnvBaseUrlVar(provider: string): string | undefined {
    const normalized = normalizeProviderId(provider);
    const descriptor = this.getDescriptor(normalized);
    if (!descriptor) return undefined;
    if (descriptor.id === "openai-compatible") {
      return BASE_URL_ENV_BY_ALIAS[normalized];
    }
    return descriptor.envBaseURL;
  }

  static getCapabilities(provider: string, model?: string): ProviderCapabilityMetadata {
    const descriptor = this.getDescriptor(provider);
    if (!descriptor) {
      return {
        tool_calling: true,
        json_output: true,
        reasoning_effort: false,
        response_api_mode: "unknown",
      };
    }

    if (descriptor.id === "openai" && isGpt5OrLater(model)) {
      return {
        ...descriptor.capabilities,
        response_api_mode: "responses",
      };
    }

    return { ...descriptor.capabilities };
  }

  static create(config: ProviderConfig): BaseProvider {
    const normalizedInput = normalizeProviderId(config.provider);
    const descriptor = this.getDescriptor(normalizedInput);
    if (!descriptor) {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }

    const canonical = descriptor.id;
    const apiKey = config.apiKey;
    const model = config.model;
    const baseURL = config.baseURL;

    if (descriptor.requiresBaseURL && !baseURL) {
      throw new Error(`Base URL is required for provider: ${config.provider}`);
    }

    if (descriptor.requiresApiKey) {
      const allowEmptyKey = normalizedInput === "ollama";
      if (!apiKey && !allowEmptyKey) {
        throw new Error(`API key is required for provider: ${config.provider}`);
      }
    }

    if (canonical === "anthropic") {
      return new AnthropicProvider({
        apiKey: apiKey!,
        baseURL,
        model,
      });
    }

    if (canonical === "azure") {
      return new OpenAIProvider({
        apiKey: apiKey!,
        baseURL,
        model,
        defaultQuery: config.azureApiVersion ? { "api-version": config.azureApiVersion } : undefined,
      });
    }

    if (canonical === "openai-compatible") {
      return new OpenAIProvider({
        apiKey: apiKey || "ollama",
        baseURL,
        model,
      });
    }

    return new OpenAIProvider({
      apiKey: apiKey!,
      baseURL,
      model,
    });
  }
}
