/**
 * Web fetch tool - fetch and analyze web pages
 */

import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { SecurityGuard } from '../security.js';
import { tool } from '../registry.js';

export const webFetchSchema = z.object({
  url: z.string().url().describe('The URL to fetch'),
  maxLength: z.number().min(1000).max(50000).default(50000).describe('Maximum content length'),
});

tool({
  name: 'web_fetch',
  description: 'Fetch a web page and extract its content. Returns title and main content.',
  schema: webFetchSchema,
  execute: async ({ url, maxLength }) => {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024, // 10MB
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Koder/1.0; +https://github.com/anthropics/koder)',
        },
      });

      const $ = cheerio.load(response.data);

      // Extract title
      const title = $('title').text().trim() || 'No title';

      // Remove scripts, styles, and nav elements
      $('script, style, nav, footer, header, aside').remove();

      // Extract main content
      const content = $('body').text().trim();

      // Clean up content
      const cleaned = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

      // Truncate if needed
      const truncated =
        cleaned.length > maxLength ? cleaned.substring(0, maxLength) + '\n...' : cleaned;

      const result = `Title: ${title}\nURL: ${url}\n\nContent:\n${truncated}`;

      return SecurityGuard.filterSensitiveOutput(result);
    } catch (error) {
      return `Fetch failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});