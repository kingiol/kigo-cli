/**
 * Read file tool
 */

import { z } from 'zod';
import { tool } from '../registry.js';
import { SecurityGuard } from '../security.js';

export const readFileSchema = z.object({
  path: z.string().describe('The path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from (0-indexed)'),
  limit: z.number().optional().describe('Maximum number of lines to read'),
});

tool({
  name: 'read_file',
  description: 'Read the contents of a file. Supports line numbers and pagination.',
  schema: readFileSchema,
  execute: async ({ path, offset, limit }) => {
    const sanitizedPath = SecurityGuard.sanitizePath(path);

    // Check file size
    const sizeError = await SecurityGuard.checkFileSize(sanitizedPath, 50);
    if (sizeError) {
      return sizeError;
    }

    const fs = await import('node:fs/promises');
    const content = await fs.readFile(sanitizedPath, 'utf-8');
    const lines = content.split('\n');

    let startLine = offset !== undefined ? offset : 0;
    let endLine = limit !== undefined ? startLine + limit : lines.length;

    // Clamp to valid range
    startLine = Math.max(0, startLine);
    endLine = Math.min(lines.length, endLine);

    const resultLines: string[] = [];
    for (let i = startLine; i < endLine; i++) {
      resultLines.push(`${i + 1}|${lines[i]}`);
    }

    return resultLines.join('\n');
  },
});