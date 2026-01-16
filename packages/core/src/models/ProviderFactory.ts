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
  azureApiVersion?: string;
}

export class ProviderFactory {
  static create(config: ProviderConfig): BaseProvider {
    const { provider, apiKey, baseURL, model, azureApiVersion } = config;
    const openAICompatibleProviders = new Set([
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

    switch (provider) {
      case 'openai':
        if (!apiKey) throw new Error('OpenAI API key is required');
        return new OpenAIProvider({ apiKey, baseURL, model });

      case 'anthropic':
        if (!apiKey) throw new Error('Anthropic API key is required');
        return new AnthropicProvider({ apiKey, baseURL, model });

      case 'azure':
        if (!apiKey) throw new Error('Azure API key is required');
        if (!baseURL) throw new Error('Azure API base URL is required');
        return new OpenAIProvider({
          apiKey,
          baseURL,
          model,
          defaultQuery: azureApiVersion ? { 'api-version': azureApiVersion } : undefined,
        });

      default:
        if (openAICompatibleProviders.has(provider)) {
          if (!baseURL) {
            throw new Error(`Base URL is required for provider: ${provider}`);
          }
          const key = apiKey || (provider === 'ollama' ? 'ollama' : undefined);
          if (!key) {
            throw new Error(`API key is required for provider: ${provider}`);
          }
          return new OpenAIProvider({ apiKey: key, baseURL, model });
        }
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  static getProviderFromEnv(): string {
    // Check for API keys in environment
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.OPENROUTER_API_KEY) return 'openrouter';
    if (process.env.TOGETHERAI_API_KEY) return 'together_ai';
    if (process.env.DEEPINFRA_API_KEY) return 'deepinfra';
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.MISTRAL_API_KEY) return 'mistral';
    if (process.env.PERPLEXITYAI_API_KEY) return 'perplexity';
    if (process.env.FIREWORKS_AI_API_KEY) return 'fireworks_ai';
    if (process.env.CLOUDFLARE_API_KEY) return 'cloudflare';
    if (process.env.AZURE_API_KEY) return 'azure';
    if (process.env.OLLAMA_BASE_URL) return 'ollama';
    return 'openai'; // Default
  }
}
