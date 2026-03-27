import path from 'node:path';
import type { ToolExecutionContext } from '@kigo/core';
import { SecurityGuard } from './security.js';

export function getToolProjectRoot(context?: ToolExecutionContext): string {
  return context?.projectRoot || process.env.KIGO_PROJECT_ROOT || process.cwd();
}

export function resolveToolPath(inputPath: string, context?: ToolExecutionContext): string {
  const sanitized = SecurityGuard.sanitizePath(inputPath);
  if (path.isAbsolute(sanitized)) {
    return path.normalize(sanitized);
  }
  return path.resolve(getToolProjectRoot(context), sanitized || '.');
}
