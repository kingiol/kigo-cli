/**
 * Minimal LSP server for Kigo.
 */

import {
  CompletionItemKind,
  createConnection,
  InitializeParams,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProviderFactory } from '@kigo/core';
import type { BaseProvider, Message } from '@kigo/core';
import { fileURLToPath } from 'node:url';

const COMPLETION_SYSTEM_PROMPT =
  'You are a code completion engine. Return only the exact completion text to insert at the cursor. Do not include code fences or explanations.';

const HOVER_SYSTEM_PROMPT =
  'You are a concise programming assistant. Explain the symbol in one or two sentences without code blocks.';

function getProviderConfig(): {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
} | null {
  const provider = process.env.KIGO_LSP_PROVIDER || ProviderFactory.getProviderFromEnv();
  const model = process.env.KIGO_LSP_MODEL || process.env.KIGO_MODEL || 'gpt-4o';

  const apiKeyMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    together_ai: 'TOGETHERAI_API_KEY',
    deepinfra: 'DEEPINFRA_API_KEY',
    groq: 'GROQ_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    perplexity: 'PERPLEXITYAI_API_KEY',
    fireworks_ai: 'FIREWORKS_AI_API_KEY',
    cloudflare: 'CLOUDFLARE_API_KEY',
    azure: 'AZURE_API_KEY'
  };

  const baseUrlMap: Record<string, string> = {
    openai: 'OPENAI_BASE_URL',
    anthropic: 'ANTHROPIC_BASE_URL',
    openrouter: 'OPENROUTER_BASE_URL',
    together_ai: 'TOGETHERAI_BASE_URL',
    deepinfra: 'DEEPINFRA_BASE_URL',
    groq: 'GROQ_BASE_URL',
    mistral: 'MISTRAL_BASE_URL',
    perplexity: 'PERPLEXITYAI_BASE_URL',
    fireworks_ai: 'FIREWORKS_AI_BASE_URL',
    cloudflare: 'CLOUDFLARE_BASE_URL',
    azure: 'AZURE_API_BASE',
    ollama: 'OLLAMA_BASE_URL'
  };

  const apiKey = process.env[apiKeyMap[provider]];
  const baseURL = process.env.KIGO_LSP_BASE_URL || process.env[baseUrlMap[provider]];

  if (provider !== 'ollama' && !apiKey) {
    return null;
  }

  return { provider, apiKey, baseURL, model };
}

function createProvider(): BaseProvider | null {
  const config = getProviderConfig();
  if (!config) return null;

  try {
    return ProviderFactory.create({
      provider: config.provider,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      azureApiVersion: process.env.AZURE_API_VERSION
    });
  } catch (error) {
    return null;
  }
}

function sanitizeCompletion(text: string): string {
  return text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
}

function getWordAtPosition(doc: TextDocument, offset: number): string | null {
  const text = doc.getText();
  const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  let start = offset;
  let end = offset;

  while (start > 0 && isWord(text[start - 1] || '')) {
    start -= 1;
  }
  while (end < text.length && isWord(text[end] || '')) {
    end += 1;
  }

  const word = text.slice(start, end);
  return word ? word : null;
}

async function requestCompletion(
  provider: BaseProvider,
  languageId: string,
  before: string,
  after: string
): Promise<string> {
  const userPrompt = `Language: ${languageId}
Before cursor:
${before}

After cursor:
${after}

Completion:`;

  const messages: Message[] = [
    { role: 'system', content: COMPLETION_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  const response = await provider.chatNonStream({
    messages,
    maxTokens: 128,
    temperature: 0.2
  });

  return sanitizeCompletion(response.content || '');
}

async function requestHover(provider: BaseProvider, languageId: string, symbol: string): Promise<string> {
  const messages: Message[] = [
    { role: 'system', content: HOVER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Language: ${languageId}\nSymbol: ${symbol}\nExplain:`
    }
  ];

  const response = await provider.chatNonStream({
    messages,
    maxTokens: 128,
    temperature: 0.2
  });

  return response.content || symbol;
}

export function startLspServer(): void {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const provider = createProvider();
  const enableHoverAI = process.env.KIGO_LSP_HOVER_AI === 'true';

  connection.onInitialize((_params: InitializeParams) => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', ':', '/', '"', "'"]
      },
      hoverProvider: true
    }
  }));

  documents.onDidChangeContent((change) => {
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
  });

  connection.onCompletion(async (params) => {
    if (!provider) {
      return [];
    }
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const offset = doc.offsetAt(params.position);
    const text = doc.getText();
    const start = Math.max(0, offset - 2000);
    const end = Math.min(text.length, offset + 200);
    const before = text.slice(start, offset);
    const after = text.slice(offset, end);

    try {
      const completion = await requestCompletion(provider, doc.languageId, before, after);
      if (!completion.trim()) return [];
      return [
        {
          label: completion.length > 60 ? `${completion.slice(0, 57)}...` : completion,
          kind: CompletionItemKind.Text,
          insertText: completion,
          detail: 'Kigo LSP'
        }
      ];
    } catch (error) {
      connection.console.error(`Completion error: ${String(error)}`);
      return [];
    }
  });

  connection.onHover(async (params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const offset = doc.offsetAt(params.position);
    const word = getWordAtPosition(doc, offset);
    if (!word) return null;

    if (!provider || !enableHoverAI) {
      return {
        contents: { kind: 'markdown', value: `\`${word}\`` }
      };
    }

    try {
      const hoverText = await requestHover(provider, doc.languageId, word);
      return { contents: { kind: 'markdown', value: hoverText } };
    } catch (error) {
      connection.console.error(`Hover error: ${String(error)}`);
      return { contents: { kind: 'markdown', value: `\`${word}\`` } };
    }
  });

  documents.listen(connection);
  connection.listen();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startLspServer();
}
