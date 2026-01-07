/**
 * Diff generation utilities
 */

export function generateDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Simple diff algorithm
  const diff: string[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else {
      // Find the next matching line
      let found = false;
      for (let k = 1; k <= 5; k++) {
        if (i + k < oldLines.length && j < newLines.length && oldLines[i + k] === newLines[j]) {
          // Lines were deleted
          for (let m = 0; m < k; m++) {
            diff.push(`- ${oldLines[i + m]}`);
          }
          i += k;
          found = true;
          break;
        }
        if (j + k < newLines.length && i < oldLines.length && oldLines[i] === newLines[j + k]) {
          // Lines were added
          for (let m = 0; m < k; m++) {
            diff.push(`+ ${newLines[j + m]}`);
          }
          j += k;
          found = true;
          break;
        }
      }

      if (!found) {
        if (i < oldLines.length) {
          diff.push(`- ${oldLines[i]}`);
          i++;
        }
        if (j < newLines.length) {
          diff.push(`+ ${newLines[j]}`);
          j++;
        }
      }
    }
  }

  if (diff.length === 0) {
    return `No changes to ${filePath}`;
  }

  return `Changes to ${filePath}:\n${diff.join('\n')}`;
}