/**
 * Multi-edit tool for applying sequential find/replace edits atomically
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { z } from 'zod';
import { tool } from '../registry.js';
import { SecurityGuard } from '../security.js';

const editOperationSchema = z.object({
  oldString: z.string().describe('Text to find in file'),
  newString: z.string().describe('Replacement text'),
  replaceAll: z.boolean().default(false).describe('Replace all occurrences'),
});

export const multiEditSchema = z
  .object({
    filePath: z.string().optional().describe('Absolute or relative path to target file'),
    path: z.string().optional().describe('Alias for filePath'),
    edits: z.array(editOperationSchema).min(1).describe('Edits to run in sequence'),
  })
  .refine((value) => Boolean(value.filePath || value.path), {
    message: 'filePath or path is required',
  });

function toAbsolutePath(inputPath: string): string {
  const sanitized = SecurityGuard.sanitizePath(inputPath);
  const validationError = SecurityGuard.validatePath(sanitized);
  if (validationError) {
    throw new Error(validationError);
  }

  return nodePath.isAbsolute(sanitized)
    ? nodePath.normalize(sanitized)
    : nodePath.resolve(process.cwd(), sanitized);
}

function countOccurrences(content: string, needle: string): number {
  if (!needle) return 0;
  return content.split(needle).length - 1;
}

function replaceFirst(content: string, oldString: string, newString: string): string {
  const index = content.indexOf(oldString);
  if (index < 0) {
    return content;
  }
  return `${content.slice(0, index)}${newString}${content.slice(index + oldString.length)}`;
}

tool({
  name: 'multiedit',
  description:
    'Apply multiple find/replace edits to one file in order. All edits must succeed or no changes are written.',
  schema: multiEditSchema,
  execute: async ({ filePath, path, edits }) => {
    const targetPath = toAbsolutePath(filePath || path || '');

    let content = '';
    let fileExists = true;
    try {
      content = await fs.readFile(targetPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        fileExists = false;
        content = '';
      } else {
        throw error;
      }
    }

    const replacementSummary: string[] = [];
    let nextContent = content;

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (edit.oldString === edit.newString) {
        throw new Error(`Edit ${i + 1} rejected: oldString and newString must be different`);
      }

      if (edit.oldString.length === 0) {
        if (nextContent.length > 0 && i > 0) {
          throw new Error(`Edit ${i + 1} rejected: empty oldString only allowed as first edit on a new file`);
        }
        if (fileExists || nextContent.length > 0) {
          throw new Error(`Edit ${i + 1} rejected: empty oldString only supported for new file creation`);
        }
        nextContent = edit.newString;
        replacementSummary.push(`#${i + 1}: created file`);
        continue;
      }

      const occurrences = countOccurrences(nextContent, edit.oldString);
      if (occurrences === 0) {
        throw new Error(`Edit ${i + 1} failed: oldString not found`);
      }

      if (!edit.replaceAll && occurrences > 1) {
        throw new Error(
          `Edit ${i + 1} is ambiguous: oldString appears ${occurrences} times, set replaceAll=true`,
        );
      }

      if (edit.replaceAll) {
        nextContent = nextContent.split(edit.oldString).join(edit.newString);
        replacementSummary.push(`#${i + 1}: replaced ${occurrences} occurrence(s)`);
      } else {
        nextContent = replaceFirst(nextContent, edit.oldString, edit.newString);
        replacementSummary.push(`#${i + 1}: replaced 1 occurrence`);
      }
    }

    await fs.mkdir(nodePath.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, nextContent, 'utf-8');

    const relative = nodePath.relative(process.cwd(), targetPath) || targetPath;
    return `Applied ${edits.length} edit(s) to ${relative}\n${replacementSummary.join('\n')}`;
  },
});
