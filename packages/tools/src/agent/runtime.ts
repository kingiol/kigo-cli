/**
 * Sub-agent runtime registry for multi-app usage.
 */

import type { SubAgentManagerOptions } from '@kigo/core';
import { SubAgentManager } from '@kigo/core';
import { registerSubAgentTool } from './subAgent.js';

export interface SubAgentRuntimeOptions {
  allowNestedDefault?: boolean;
  getSessionId?: () => string | undefined | null;
}

export class SubAgentRuntime {
  private managers = new Map<string, SubAgentManager>();
  private getSessionId: () => string | undefined | null;

  constructor(options: SubAgentRuntimeOptions = {}) {
    this.getSessionId = options.getSessionId || (() => process.env.KIGO_SESSION_ID);
    registerSubAgentTool(
      () => {
        const sessionId = this.getSessionId();
        if (!sessionId) return null;
        return this.managers.get(sessionId) || null;
      },
      { allowNestedDefault: options.allowNestedDefault ?? false }
    );
  }

  createManager(sessionId: string, options: SubAgentManagerOptions): SubAgentManager {
    const manager = new SubAgentManager(options);
    this.managers.set(sessionId, manager);
    return manager;
  }

  getManager(sessionId: string): SubAgentManager | undefined {
    return this.managers.get(sessionId);
  }

  removeManager(sessionId: string): void {
    this.managers.delete(sessionId);
  }

  clear(): void {
    this.managers.clear();
  }
}
