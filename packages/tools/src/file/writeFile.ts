/**
 * Write file tool
 */

import { z } from 'zod';
import { tool } from '../registry.js';
import { SecurityGuard } from '../security.js';
import { generateDiff } from './diff.js';

export const writeFileSchema = z.object({
  path: z.string().describe('The path to the file to write'),
  content: z.string().describe('The content to write to the file'),
});

tool({
  name: 'write_file',
  description: 'Write content to a file. Creates a unified diff showing changes.',
  schema: writeFileSchema,
  execute: async ({ path, content }) => {
    const sanitizedPath = SecurityGuard.sanitizePath(path);

    const fs = await import('node:fs/promises');
    const pathModule = await import('node:path');

    let oldContent = '';
    try {
      oldContent = await fs.readFile(sanitizedPath, 'utf-8');
    } catch {
      // File doesn't exist, that's fine
    }

    // Create directory if needed
    const dir = pathModule.dirname(sanitizedPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(sanitizedPath, content, 'utf-8');

    // Generate diff
    const diff = generateDiff(sanitizedPath, oldContent, content);
    return diff;
  },
});