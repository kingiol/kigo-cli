/**
 * List directory tool
 */

import { z } from 'zod';
import { tool } from '../registry.js';
import { SecurityGuard } from '../security.js';

export const listDirectorySchema = z.object({
  path: z.string().optional().describe('The path to the directory to list (default: current directory)'),
  showHidden: z.boolean().optional().default(false).describe('Show hidden files'),
});

tool({
  name: 'list_directory',
  description: 'List the contents of a directory.',
  schema: listDirectorySchema,
  execute: async ({ path: dirPath, showHidden }) => {
    const sanitizedPath = SecurityGuard.sanitizePath(dirPath || '.');

    const fs = await import('node:fs/promises');
    const entries = await fs.readdir(sanitizedPath, { withFileTypes: true });

    const result: string[] = [];
    for (const entry of entries) {
      // Skip hidden files unless requested
      if (!showHidden && entry.name.startsWith('.')) {
        continue;
      }

      const type = entry.isDirectory() ? 'DIR' : entry.isSymbolicLink() ? 'SYMLINK' : 'FILE';

      try {
        const stats = await fs.stat(`${sanitizedPath}/${entry.name}`);
        const size = entry.isFile() ? formatSize(stats.size) : '';
        result.push(`${type.padEnd(8)} ${entry.name.padEnd(30)} ${size}`);
      } catch {
        result.push(`${type.padEnd(8)} ${entry.name}`);
      }
    }

    return result.length > 0 ? result.join('\n') : 'Directory is empty';
  },
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}