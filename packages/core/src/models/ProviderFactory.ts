/**
 * Provider factory for creating LLM providers
 */

import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { BaseProvider } from './BaseProvider.js';

export interface ProviderConfig {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class ProviderFactory {
  static create(config: ProviderConfig): BaseProvider {
    const { provider, apiKey, baseURL, model } = config;

    switch (provider) {
      case 'openai':
        if (!apiKey) throw new Error('OpenAI API key is required');
        return new OpenAIProvider({ apiKey, baseURL, model });

      case 'anthropic':
        if (!apiKey) throw new Error('Anthropic API key is required');
        return new AnthropicProvider({ apiKey, baseURL, model });

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static getProviderFromEnv(): string {
    // Check for API keys in environment
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
    return 'openai'; // Default
  }
}