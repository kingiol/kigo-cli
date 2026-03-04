/**
 * Apply patch tool (Codex-style envelope patch format)
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { z } from 'zod';
import { tool } from '../registry.js';
import { SecurityGuard } from '../security.js';

type PatchChunk = {
  oldLines: string[];
  newLines: string[];
  context?: string;
  isEndOfFile?: boolean;
};

type AddSection = {
  type: 'add';
  filePath: string;
  content: string;
};

type DeleteSection = {
  type: 'delete';
  filePath: string;
};

type UpdateSection = {
  type: 'update';
  filePath: string;
  movePath?: string;
  chunks: PatchChunk[];
};

type PatchSection = AddSection | DeleteSection | UpdateSection;

type FileState = string | null;

const BEGIN_PATCH = '*** Begin Patch';
const END_PATCH = '*** End Patch';
const ADD_FILE = '*** Add File:';
const DELETE_FILE = '*** Delete File:';
const UPDATE_FILE = '*** Update File:';
const MOVE_TO = '*** Move to:';
const END_OF_FILE = '*** End of File';

export const applyPatchSchema = z
  .object({
    patchText: z.string().optional().describe('Patch text in envelope format'),
    patch: z.string().optional().describe('Alias of patchText'),
  })
  .refine((value) => Boolean(value.patchText || value.patch), {
    message: 'patchText or patch is required',
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

function parseHeaderPath(line: string, prefix: string): string {
  const raw = line.slice(prefix.length).trim();
  if (!raw) {
    throw new Error(`Invalid patch header: ${line}`);
  }
  return toAbsolutePath(raw);
}

function isSectionHeader(line: string): boolean {
  return line.startsWith(ADD_FILE) || line.startsWith(DELETE_FILE) || line.startsWith(UPDATE_FILE);
}

function parsePatchSections(patchText: string): PatchSection[] {
  const normalized = patchText.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const begin = lines.findIndex((line) => line.trim() === BEGIN_PATCH);
  const end = lines.findIndex((line) => line.trim() === END_PATCH);

  if (begin < 0 || end < 0 || begin >= end) {
    throw new Error('Invalid patch format: missing Begin/End markers');
  }

  const sections: PatchSection[] = [];
  let i = begin + 1;

  while (i < end) {
    const line = lines[i];

    if (!line || !line.trim()) {
      i++;
      continue;
    }

    if (line.startsWith(ADD_FILE)) {
      const filePath = parseHeaderPath(line, ADD_FILE);
      i++;
      const addLines: string[] = [];
      while (i < end && !isSectionHeader(lines[i])) {
        const current = lines[i];
        if (current.startsWith('*** ')) {
          throw new Error(`Invalid line in add section: ${current}`);
        }
        if (!current.startsWith('+')) {
          throw new Error(`Add section lines must start with +: ${current}`);
        }
        addLines.push(current.slice(1));
        i++;
      }
      sections.push({
        type: 'add',
        filePath,
        content: addLines.join('\n'),
      });
      continue;
    }

    if (line.startsWith(DELETE_FILE)) {
      sections.push({
        type: 'delete',
        filePath: parseHeaderPath(line, DELETE_FILE),
      });
      i++;
      continue;
    }

    if (line.startsWith(UPDATE_FILE)) {
      const filePath = parseHeaderPath(line, UPDATE_FILE);
      i++;
      let movePath: string | undefined;
      if (i < end && lines[i].startsWith(MOVE_TO)) {
        movePath = parseHeaderPath(lines[i], MOVE_TO);
        i++;
      }

      const chunks: PatchChunk[] = [];
      let activeChunk: PatchChunk | null = null;

      while (i < end && !isSectionHeader(lines[i])) {
        const current = lines[i];
        if (current.startsWith('@@')) {
          if (activeChunk) {
            chunks.push(activeChunk);
          }
          activeChunk = {
            oldLines: [],
            newLines: [],
            context: current.slice(2).trim() || undefined,
          };
          i++;
          continue;
        }

        if (current === END_OF_FILE) {
          if (!activeChunk) {
            activeChunk = {
              oldLines: [],
              newLines: [],
            };
          }
          activeChunk.isEndOfFile = true;
          i++;
          continue;
        }

        const prefix = current[0];
        if (prefix === ' ' || prefix === '+' || prefix === '-') {
          if (!activeChunk) {
            activeChunk = {
              oldLines: [],
              newLines: [],
            };
          }
          const content = current.slice(1);
          if (prefix === ' ') {
            activeChunk.oldLines.push(content);
            activeChunk.newLines.push(content);
          } else if (prefix === '+') {
            activeChunk.newLines.push(content);
          } else {
            activeChunk.oldLines.push(content);
          }
          i++;
          continue;
        }

        if (current.trim() === '') {
          if (!activeChunk) {
            activeChunk = {
              oldLines: [],
              newLines: [],
            };
          }
          activeChunk.oldLines.push('');
          activeChunk.newLines.push('');
          i++;
          continue;
        }

        throw new Error(`Invalid update section line: ${current}`);
      }

      if (activeChunk) {
        chunks.push(activeChunk);
      }

      sections.push({
        type: 'update',
        filePath,
        movePath,
        chunks,
      });
      continue;
    }

    throw new Error(`Invalid patch section header: ${line}`);
  }

  if (sections.length === 0) {
    throw new Error('Patch rejected: no sections found');
  }

  return sections;
}

function splitContent(content: string): { lines: string[]; hasTrailingNewline: boolean } {
  if (content.length === 0) {
    return {
      lines: [],
      hasTrailingNewline: false,
    };
  }

  const hasTrailingNewline = content.endsWith('\n');
  const lines = content.split('\n');
  if (hasTrailingNewline) {
    lines.pop();
  }
  return {
    lines,
    hasTrailingNewline,
  };
}

function joinContent(lines: string[], hasTrailingNewline: boolean): string {
  if (lines.length === 0) {
    return hasTrailingNewline ? '\n' : '';
  }
  return lines.join('\n') + (hasTrailingNewline ? '\n' : '');
}

function findSubsequence(lines: string[], target: string[], startIndex: number): number {
  if (target.length === 0) {
    return startIndex;
  }

  for (let i = startIndex; i <= lines.length - target.length; i++) {
    let matched = true;
    for (let j = 0; j < target.length; j++) {
      if (lines[i + j] !== target[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return i;
    }
  }

  return -1;
}

function applyChunks(content: string, filePath: string, chunks: PatchChunk[]): string {
  const { lines: originalLines, hasTrailingNewline } = splitContent(content);
  const lines = [...originalLines];
  let cursor = 0;

  for (const chunk of chunks) {
    const oldLines = chunk.oldLines;
    const newLines = chunk.newLines;

    if (oldLines.length === 0) {
      const insertionIndex = Math.min(cursor, lines.length);
      lines.splice(insertionIndex, 0, ...newLines);
      cursor = insertionIndex + newLines.length;
      continue;
    }

    let start = findSubsequence(lines, oldLines, cursor);
    if (start === -1) {
      start = findSubsequence(lines, oldLines, 0);
    }

    if (start === -1) {
      const sample = chunk.context || oldLines[0] || '<empty>';
      throw new Error(`Failed to match patch chunk in ${filePath}: ${sample}`);
    }

    lines.splice(start, oldLines.length, ...newLines);
    cursor = start + newLines.length;
  }

  return joinContent(lines, hasTrailingNewline);
}

async function readState(filePath: string): Promise<FileState> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

type MutableState = {
  initial: Map<string, FileState>;
  current: Map<string, FileState>;
};

async function getOrLoadState(state: MutableState, filePath: string): Promise<FileState> {
  if (state.current.has(filePath)) {
    return state.current.get(filePath) ?? null;
  }

  const value = await readState(filePath);
  state.initial.set(filePath, value);
  state.current.set(filePath, value);
  return value;
}

async function executeApplyPatch(input: z.infer<typeof applyPatchSchema>): Promise<string> {
  const patchText = input.patchText || input.patch;
  if (!patchText) {
    return 'apply_patch failed: patchText or patch is required';
  }

  let sections: PatchSection[];
  try {
    sections = parsePatchSections(patchText);
  } catch (error) {
    return `apply_patch verification failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const state: MutableState = {
    initial: new Map<string, FileState>(),
    current: new Map<string, FileState>(),
  };

  const summary: string[] = [];

  for (const section of sections) {
    if (section.type === 'add') {
      const existing = await getOrLoadState(state, section.filePath);
      if (existing !== null) {
        return `apply_patch verification failed: file already exists: ${section.filePath}`;
      }
      state.current.set(section.filePath, section.content);
      summary.push(`A ${nodePath.relative(process.cwd(), section.filePath) || section.filePath}`);
      continue;
    }

    if (section.type === 'delete') {
      const existing = await getOrLoadState(state, section.filePath);
      if (existing === null) {
        return `apply_patch verification failed: file does not exist: ${section.filePath}`;
      }
      state.current.set(section.filePath, null);
      summary.push(`D ${nodePath.relative(process.cwd(), section.filePath) || section.filePath}`);
      continue;
    }

    const existing = await getOrLoadState(state, section.filePath);
    if (existing === null) {
      return `apply_patch verification failed: file does not exist: ${section.filePath}`;
    }

    let updatedContent = existing;
    try {
      updatedContent = applyChunks(existing, section.filePath, section.chunks);
    } catch (error) {
      return `apply_patch verification failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (section.movePath && section.movePath !== section.filePath) {
      const moveTarget = await getOrLoadState(state, section.movePath);
      if (moveTarget !== null) {
        return `apply_patch verification failed: move target already exists: ${section.movePath}`;
      }
      state.current.set(section.filePath, null);
      state.current.set(section.movePath, updatedContent);
      summary.push(
        `M ${nodePath.relative(process.cwd(), section.filePath) || section.filePath} -> ${
          nodePath.relative(process.cwd(), section.movePath) || section.movePath
        }`,
      );
    } else {
      state.current.set(section.filePath, updatedContent);
      summary.push(`M ${nodePath.relative(process.cwd(), section.filePath) || section.filePath}`);
    }
  }

  const touchedPaths = Array.from(state.current.keys());
  for (const filePath of touchedPaths) {
    const before = state.initial.get(filePath) ?? null;
    const after = state.current.get(filePath) ?? null;

    if (before === after) {
      continue;
    }

    if (after === null) {
      await fs.unlink(filePath);
      continue;
    }

    await fs.mkdir(nodePath.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, after, 'utf-8');
  }

  if (summary.length === 0) {
    return 'Patch applied with no file changes.';
  }

  return `Success. Updated files:\n${summary.join('\n')}`;
}

tool({
  name: 'apply_patch',
  description: 'Apply a patch using Codex-style envelope format (*** Begin Patch ... *** End Patch).',
  schema: applyPatchSchema,
  execute: executeApplyPatch,
});
