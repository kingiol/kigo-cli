/**
 * Edit file tool using unified diff format
 */

import { z } from 'zod';
import { tool } from '../registry.js';
import { SecurityGuard } from '../security.js';
import { applyDiff } from './diffParser.js';

export const editFileSchema = z.object({
  path: z.string().describe('The path to the file to edit'),
  diff: z.string().describe('Unified diff format changes to apply'),
});

tool({
  name: 'edit_file',
  description: 'Edit a file by applying a unified diff. Use this for precise edits.',
  schema: editFileSchema,
  execute: async ({ path, diff }) => {
    const sanitizedPath = SecurityGuard.sanitizePath(path);

    // Check file size
    const sizeError = await SecurityGuard.checkFileSize(sanitizedPath, 50);
    if (sizeError) {
      return sizeError;
    }

    const fs = await import('node:fs/promises');
    const oldContent = await fs.readFile(sanitizedPath, 'utf-8');

    try {
      const newContent = applyDiff(oldContent, diff);
      await fs.writeFile(sanitizedPath, newContent, 'utf-8');
      return `Successfully applied diff to ${path}`;
    } catch (error) {
      return `Failed to apply diff: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});