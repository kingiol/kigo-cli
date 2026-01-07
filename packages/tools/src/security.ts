/**
 * Security guard for validating paths and commands
 */

import * as path from 'node:path';

export class SecurityGuard {
  private static readonly FORBIDDEN_WORDS = new Set([
    'rm -rf',
    'shutdown',
    'reboot',
    'poweroff',
    'halt',
  ]);

  private static readonly DANGEROUS_PATTERNS = [
    />\s*\/dev\/(?!null\b)/, // Writing to device files (allow /dev/null)
    /dd\s+if=/, // Disk destroyer
    /mkfs/, // Format filesystem
    /:\(\)\{ :\|:& \};:/, // Fork bomb
    /while\s+true\s*;\s*do\s*:\s*;\s*done/, // Another fork bomb variant
    />\s*\/dev\/sda/, // Direct disk write
    />\s*\/dev\/nvme/, // NVMe disk write
  ];

  private static readonly MAX_FILE_SIZE_MB = 50;

  static validateCommand(command: string): string | null {
    const lower = command.toLowerCase();

    // Check forbidden words
    for (const word of this.FORBIDDEN_WORDS) {
      if (lower.includes(word)) {
        return `Forbidden command pattern detected: ${word}`;
      }
    }

    // Check dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(lower)) {
        return 'Dangerous command pattern detected';
      }
    }

    return null;
  }

  static sanitizePath(inputPath: string): string {
    // Remove null bytes
    let sanitized = inputPath.replace(/\0/g, '');

    // Normalize path separators
    sanitized = sanitized.replace(/\\/g, '/');

    // Remove redundant separators
    while (sanitized.includes('//')) {
      sanitized = sanitized.replace(/\/\//g, '/');
    }

    // Remove trailing separator
    sanitized = sanitized.replace(/\/+$/, '');

    return sanitized;
  }

  static async checkFileSize(
    filePath: string,
    maxSizeMB: number = this.MAX_FILE_SIZE_MB
  ): Promise<string | null> {
    try {
      const fs = await import('node:fs/promises');
      const stats = await fs.stat(filePath);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB > maxSizeMB) {
        return `File too large: ${sizeMB.toFixed(2)}MB (max: ${maxSizeMB}MB)`;
      }

      return null;
    } catch (error) {
      return `Error checking file size: ${String(error)}`;
    }
  }

  static filterSensitiveOutput(text: string): string {
    let filtered = text;

    // Filter API keys (sk- followed by 20+ alphanumeric chars)
    filtered = filtered.replace(/sk-[a-zA-Z0-9]{20,}/g, '[TOKEN]');

    // Filter OpenAI keys (sk-proj- followed by 20+ alphanumeric chars)
    filtered = filtered.replace(/sk-proj-[a-zA-Z0-9_-]{20,}/g, '[TOKEN]');

    // Filter Anthropic keys (sk-ant- followed by 20+ alphanumeric chars)
    filtered = filtered.replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[TOKEN]');

    // Filter Google API keys (AIza followed by 30+ alphanumeric chars)
    filtered = filtered.replace(/AIza[a-zA-Z0-9_-]{30,}/g, '[TOKEN]');

    // Filter secrets with common patterns
    filtered = filtered.replace(
      /(api[_-]?key|token|secret|password|passwd)[\s:=]+[a-zA-Z0-9\-_]{10,}/gi,
      '$1 [REDACTED]'
    );

    // Filter JWT tokens
    filtered = filtered.replace(
      /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
      '[JWT_TOKEN]'
    );

    return filtered;
  }

  static validatePath(inputPath: string): string | null {
    const sanitized = this.sanitizePath(inputPath);

    // Check for path traversal attempts
    if (sanitized.includes('..')) {
      return 'Path traversal detected';
    }

    // Check for absolute paths (allow but warn)
    if (path.isAbsolute(sanitized)) {
      // Allow absolute paths but could add warning
    }

    return null;
  }

  static isSafePath(inputPath: string, allowedDirs: string[] = []): boolean {
    const sanitized = this.sanitizePath(inputPath);
    const resolved = path.resolve(sanitized);

    // If no allowed dirs specified, allow all non-traversal paths
    if (allowedDirs.length === 0) {
      return !sanitized.includes('..');
    }

    // Check if path is within allowed directories
    for (const allowedDir of allowedDirs) {
      const resolvedAllowed = path.resolve(allowedDir);
      if (resolved.startsWith(resolvedAllowed)) {
        return true;
      }
    }

    return false;
  }
}