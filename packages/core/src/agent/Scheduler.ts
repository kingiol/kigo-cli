/**
 * AgentScheduler for orchestrating agent execution with hooks
 */

import type { StreamingEvent } from '../types.js';
import { Agent } from './Agent.js';

export interface SchedulerOptions {
  sessionId?: string;
  streaming?: boolean;
  hooks?: Hook[];
}

export interface Hook {
  beforeToolCall?: (toolCall: any) => Promise<boolean>;
  afterToolCall?: (result: any) => Promise<void>;
  onError?: (error: Error) => Promise<void>;
  beforeMessage?: (message: string) => Promise<boolean>;
  afterMessage?: (events: StreamingEvent[]) => Promise<void>;
}

export class AgentScheduler {
  private agent: Agent;
  private hooks: Hook[] = [];
  private sessionId: string;

  constructor(agent: Agent, options: SchedulerOptions = {}) {
    this.agent = agent;
    this.hooks = options.hooks || [];
    this.sessionId = options.sessionId || this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async *run(input: string): AsyncGenerator<StreamingEvent> {
    // Before message hook
    const approved = await this.runHooks('beforeMessage', input);
    if (!approved) {
      yield { type: 'error', data: 'Message rejected by hook' };
      return;
    }

    const events: StreamingEvent[] = [];
    const traceId = this.generateTraceId();
    let spanCounter = 0;

    try {
      for await (const event of this.agent.run(input)) {
        const enrichedEvent: StreamingEvent = {
          ...event,
          meta: {
            traceId,
            spanId: `span_${spanCounter++}`,
            timestamp: Date.now(),
          },
        };
        events.push(enrichedEvent);

        if (enrichedEvent.type === 'tool_call') {
          const approved = await this.runHooks('beforeToolCall', enrichedEvent.data);
          if (!approved) {
            yield { type: 'error', data: 'Tool call rejected by hook' };
            continue;
          }
        }

        if (enrichedEvent.type === 'tool_output') {
          await this.runHooks('afterToolCall', enrichedEvent.data);
        }

        yield enrichedEvent;
      }

      // After message hook
      await this.runHooks('afterMessage', events);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.runHooks('onError', err);
      yield { type: 'error', data: err.message };
    }
  }

  private async runHooks(hookName: keyof Hook, data: any): Promise<any> {
    for (const hook of this.hooks) {
      const fn = hook[hookName];
      if (fn) {
        const result = await fn(data);
        if (result === false) {
          return false;
        }
      }
    }
    return true;
  }

  addHook(hook: Hook): void {
    this.hooks.push(hook);
  }

  removeHook(hook: Hook): void {
    const index = this.hooks.indexOf(hook);
    if (index > -1) {
      this.hooks.splice(index, 1);
    }
  }

  getAgent(): Agent {
    return this.agent;
  }
}
