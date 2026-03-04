/**
 * Code search tool for external programming context retrieval
 */

import { z } from 'zod';
import { tool } from '../registry.js';

const DEFAULT_CODESEARCH_ENDPOINT = 'https://mcp.exa.ai/mcp';
const DEFAULT_TIMEOUT_MS = 30000;

type McpCodeResponse = {
  result?: {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
};

export const codeSearchSchema = z.object({
  query: z.string().min(1).describe('Programming query to search in external code knowledge'),
  tokensNum: z.number().int().min(1000).max(50000).default(5000).describe('Requested token budget'),
  endpoint: z.string().url().optional().describe('Override codesearch endpoint'),
  timeoutMs: z.number().int().min(1000).max(120000).default(DEFAULT_TIMEOUT_MS).optional(),
});

function parseSseResponse(body: string): string | null {
  const lines = body.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    try {
      const parsed = JSON.parse(line.slice(6)) as McpCodeResponse;
      const text = parsed.result?.content?.find((item) => typeof item.text === 'string')?.text;
      if (text) {
        return text;
      }
    } catch {
      // Ignore malformed SSE chunks and continue scanning.
    }
  }
  return null;
}

function parseJsonResponse(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as McpCodeResponse;
    return parsed.result?.content?.find((item) => typeof item.text === 'string')?.text || null;
  } catch {
    return null;
  }
}

tool({
  name: 'codesearch',
  description:
    'Search and retrieve fresh programming context for APIs, libraries, SDKs, and frameworks, with adjustable token budget for focused or comprehensive results.',
  schema: codeSearchSchema,
  execute: async ({ query, tokensNum, endpoint, timeoutMs }) => {
    const targetEndpoint = endpoint || process.env.KIGO_CODESEARCH_ENDPOINT || DEFAULT_CODESEARCH_ENDPOINT;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'get_code_context_exa',
            arguments: {
              query,
              tokensNum,
            },
          },
        }),
        signal: controller.signal,
      });

      const payload = await response.text();
      if (!response.ok) {
        return `Code search failed (${response.status}): ${payload.slice(0, 500)}`;
      }

      const sseText = parseSseResponse(payload);
      if (sseText) {
        return sseText;
      }

      const jsonText = parseJsonResponse(payload);
      if (jsonText) {
        return jsonText;
      }

      return 'No code snippets found for this query.';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return `Code search timed out after ${timeoutMs || DEFAULT_TIMEOUT_MS}ms`;
      }
      return `Code search failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      clearTimeout(timeout);
    }
  },
});
