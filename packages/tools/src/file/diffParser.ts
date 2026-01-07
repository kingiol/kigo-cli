/**
 * Unified diff parser and applier
 */

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }>;
}

export interface DiffFile {
  path: string;
  hunks: Hunk[];
}

export function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');
  let currentFile: DiffFile | null = null;
  let currentHunk: Hunk | null = null;

  for (const line of lines) {
    // File header
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = { path: fileMatch[2], hunks: [] };
      currentHunk = null;
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch && currentFile) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newLines: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    // Hunk content
    if (currentHunk && line) {
      const type = line[0] === '+' ? 'add' : line[0] === '-' ? 'remove' : 'context';
      currentHunk.lines.push({ type, content: line.slice(1) });
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

export function applyDiff(content: string, diffText: string): string {
  const files = parseDiff(diffText);
  const lines = content.split('\n');

  for (const file of files) {
    for (const hunk of file.hunks) {
      applyHunk(lines, hunk);
    }
  }

  return lines.join('\n');
}

function applyHunk(lines: string[], hunk: Hunk): void {
  const oldLineIndex = hunk.oldStart - 1;
  const newLineIndex = hunk.newStart - 1;

  // Remove old lines
  let removed = 0;
  for (const line of hunk.lines) {
    if (line.type === 'remove') {
      lines.splice(oldLineIndex + removed, 1);
    } else if (line.type === 'context') {
      removed++;
    }
  }

  // Add new lines
  let added = 0;
  for (const line of hunk.lines) {
    if (line.type === 'add') {
      lines.splice(newLineIndex + added, 0, line.content);
      added++;
    } else if (line.type === 'context') {
      added++;
    }
  }
}