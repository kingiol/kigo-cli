/**
 * Grep search tool - search file contents
 */

import { z } from 'zod';
import glob from 'fast-glob';
import { tool } from '../registry.js';

export const grepSearchSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z.string().optional().describe('Root directory to search in'),
  include: z.string().optional().describe('File pattern to include (e.g., "*.ts")'),
  maxFiles: z.number().min(1).max(1000).default(100).describe('Maximum number of files to search'),
  caseInsensitive: z.boolean().default(true).describe('Case insensitive search'),
});

tool({
  name: 'grep_search',
  description: 'Search file contents using regex pattern. Returns matching lines with file paths.',
  schema: grepSearchSchema,
  execute: async ({ pattern, path: searchPath, include, maxFiles, caseInsensitive }) => {
    const fs = await import('node:fs/promises');

    const ignore = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.venv/**',
      '**/__pycache__/**',
      '**/coverage/**',
      '**/*.lock',
      '**/*.min.js',
    ];

    try {
      // Find files to search
      const globPattern = include || '**/*.{ts,js,py,java,cpp,h,md,txt,json,yaml,yml}';
      const files = await glob(globPattern, {
        cwd: searchPath || process.cwd(),
        ignore,
        absolute: false,
        onlyFiles: true,
      }).then(f => f.slice(0, maxFiles));

      // Compile regex
      const regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
      const results: string[] = [];

      // Search each file
      for (const file of files) {
        try {
          const fullPath = require('node:path').resolve(searchPath || process.cwd(), file);
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line)) {
              // Highlight matches
              const highlighted = line.replace(regex, (match: string) => {
                return `\x1b[31m${match}\x1b[0m`;
              });
              results.push(`${file}:${i + 1}:${highlighted}`);
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }

      if (results.length === 0) {
        return 'No matches found';
      }

      // Limit results and return
      return results.slice(0, 500).join('\n');
    } catch (error) {
      return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});