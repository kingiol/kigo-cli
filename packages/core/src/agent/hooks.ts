/**
 * Built-in hooks for agent execution
 */

import type { Hook } from './Scheduler.js';

/**
 * ApprovalHook - requires user approval for tool calls
 */
export class ApprovalHook implements Hook {
  private approvedTools: Set<string> = new Set();

  constructor(approvedTools: string[] = []) {
    approvedTools.forEach(t => this.approvedTools.add(t));
  }

  approveTool(toolName: string): void {
    this.approvedTools.add(toolName);
  }

  revokeTool(toolName: string): void {
    this.approvedTools.delete(toolName);
  }

  async beforeToolCall(toolCall: any): Promise<boolean> {
    return this.approvedTools.has(toolCall.name);
  }
}

/**
 * LoggingHook - logs all events
 */
export class LoggingHook implements Hook {
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logLevel = logLevel;
  }

  private log(level: string, message: string): void {
    const levels = ['debug', 'info', 'warn', 'error'];
    if (levels.indexOf(level) >= levels.indexOf(this.logLevel)) {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  }

  async beforeToolCall(toolCall: any): Promise<boolean> {
    this.log('info', `Tool call: ${toolCall.name}`);
    return true;
  }

  async afterToolCall(result: any): Promise<void> {
    this.log('info', `Tool result: ${result.error ? 'ERROR' : 'SUCCESS'}`);
  }

  async onError(error: Error): Promise<void> {
    this.log('error', `Error: ${error.message}`);
  }

  async beforeMessage(message: string): Promise<boolean> {
    this.log('debug', `User message: ${message.substring(0, 50)}...`);
    return true;
  }

  async afterMessage(events: any[]): Promise<void> {
    this.log('debug', `Generated ${events.length} events`);
  }
}

/**
 * RateLimitHook - limits tool call frequency
 */
export class RateLimitHook implements Hook {
  private callTimes: Map<string, number[]> = new Map();
  private maxCalls: number;
  private windowMs: number;

  constructor(maxCalls: number = 10, windowMs: number = 60000) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  async beforeToolCall(toolCall: any): Promise<boolean> {
    const now = Date.now();
    const toolName = toolCall.name;
    const times = this.callTimes.get(toolName) || [];

    // Remove old calls outside the window
    const recentTimes = times.filter(t => now - t < this.windowMs);

    if (recentTimes.length >= this.maxCalls) {
      return false;
    }

    recentTimes.push(now);
    this.callTimes.set(toolName, recentTimes);
    return true;
  }
}
