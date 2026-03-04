/**
 * Provider factory for creating LLM providers
 */

import type { BaseProvider } from "./BaseProvider.js";
import { ProviderRegistry } from "./ProviderRegistry.js";

export interface ProviderConfig {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  azureApiVersion?: string;
}

export class ProviderFactory {
  static create(config: ProviderConfig): BaseProvider {
    return ProviderRegistry.create(config);
  }

  static getProviderFromEnv(): string {
    const prioritized = [
      "anthropic",
      "openai",
      "openrouter",
      "together_ai",
      "deepinfra",
      "groq",
      "mistral",
      "perplexity",
      "fireworks_ai",
      "cloudflare",
      "azure",
      "ollama",
    ];

    for (const provider of prioritized) {
      const keyVar = ProviderRegistry.getEnvApiKeyVar(provider);
      const baseVar = ProviderRegistry.getEnvBaseUrlVar(provider);
      if (keyVar && process.env[keyVar]) {
        return provider;
      }
      if (provider === "ollama" && baseVar && process.env[baseVar]) {
        return provider;
      }
    }

    return "openai";
  }
}
