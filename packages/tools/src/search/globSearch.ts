/**
 * Glob search tool - find files by pattern
 */

import { z } from 'zod';
import glob from 'fast-glob';
import { tool } from '../registry.js';

export const globSearchSchema = z.object({
  pattern: z.string().describe('Glob pattern to search for (e.g., "**/*.ts")'),
  path: z.string().optional().describe('Root directory to search in'),
  limit: z.number().min(1).max(1000).default(100).describe('Maximum number of results'),
});

tool({
  name: 'glob_search',
  description: 'Find files matching a glob pattern. Supports ** for recursive search.',
  schema: globSearchSchema,
  execute: async ({ pattern, path: searchPath, limit }) => {
    const ignore = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.venv/**',
      '**/__pycache__/**',
      '**/.idea/**',
      '**/.vscode/**',
      '**/.*',
      '**/coverage/**',
      '**/*.lock',
    ];

    try {
      const results = await glob(pattern, {
        cwd: searchPath || process.cwd(),
        ignore,
        absolute: false,
        onlyFiles: true,
        caseSensitiveMatch: false,
      });

      // Limit and sort by modification time (if available)
      const limited = results.slice(0, limit);

      return limited.length > 0 ? limited.join('\n') : 'No files found matching pattern';
    } catch (error) {
      // Fallback: simple directory search
      if (!searchPath || error instanceof Error) {
        try {
          const root = searchPath || process.cwd();
          const files = await glob(pattern.split('/').pop() || '*', {
            cwd: root,
            ignore,
            absolute: false,
            onlyFiles: true,
          });
          return files.slice(0, limit).join('\n');
        } catch {
          return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});