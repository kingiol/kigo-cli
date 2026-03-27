import { z } from 'zod';
import type { CompactionArtifact } from '@kigo/core';
import { registry } from '../registry.js';

export const COMPACT_TOOL_NAME = 'compact';

export interface CompactionController {
  compact: (params: { reason?: string }) => Promise<CompactionArtifact | null>;
}

export interface CompactionRuntimeOptions {
  getSessionId?: () => string | undefined | null;
}

function registerCompactTool(
  getController: () => CompactionController | null
): void {
  if (registry.has(COMPACT_TOOL_NAME)) {
    return;
  }

  registry.register({
    name: COMPACT_TOOL_NAME,
    description: 'Compact the current conversation into a durable transcript and summary.',
    schema: z.object({
      reason: z.string().optional(),
    }),
    execute: async ({ reason }) => {
      const controller = getController();
      if (!controller) {
        throw new Error('Compaction controller not initialized');
      }

      const artifact = await controller.compact({ reason });
      if (!artifact) {
        return JSON.stringify(
          {
            type: 'compact_disabled',
            reason: 'Compaction is disabled for the current session.',
          },
          null,
          2
        );
      }

      return JSON.stringify(
        {
          type: 'compact_result',
          artifact,
        },
        null,
        2
      );
    },
  });
}

export class CompactionRuntime {
  private readonly controllers = new Map<string, CompactionController>();
  private readonly getSessionId: () => string | undefined | null;

  constructor(options: CompactionRuntimeOptions = {}) {
    this.getSessionId =
      options.getSessionId || (() => process.env.KIGO_SESSION_ID);

    registerCompactTool(() => {
      const sessionId = this.getSessionId();
      if (!sessionId) {
        return null;
      }
      return this.controllers.get(sessionId) || null;
    });
  }

  register(sessionId: string, controller: CompactionController): void {
    this.controllers.set(sessionId, controller);
  }

  remove(sessionId: string): void {
    this.controllers.delete(sessionId);
  }

  clear(): void {
    this.controllers.clear();
  }
}
