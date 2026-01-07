/**
 * Web search tool using DuckDuckGo
 */

import { z } from 'zod';
import axios from 'axios';
import { tool } from '../registry.js';

export const webSearchSchema = z.object({
  query: z.string().max(400).describe('Search query'),
  numResults: z.number().min(1).max(10).default(5).describe('Number of results'),
});

tool({
  name: 'web_search',
  description: 'Search the web using DuckDuckGo. Returns up to 10 results with titles and URLs.',
  schema: webSearchSchema,
  execute: async ({ query, numResults }) => {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1,
          kd: -1,
        },
        timeout: 10000,
      });

      const results: string[] = [];
      const topics = response.data.RelatedTopics?.slice(0, numResults) || [];

      for (const topic of topics) {
        if (topic.Text) {
          // Clean up HTML tags
          const title = topic.Text.replace(/<[^>]*>/g, '').trim();
          const url = topic.FirstURL || '';
          if (title && url) {
            results.push(`[${title}](${url})`);
          }
        }
      }

      // Also check Abstract if available
      if (response.data.Abstract && response.data.AbstractURL) {
        results.unshift(`[${response.data.Heading || 'Result'}](${response.data.AbstractURL})`);
      }

      if (results.length === 0) {
        return 'No results found';
      }

      return results.join('\n');
    } catch (error) {
      return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});