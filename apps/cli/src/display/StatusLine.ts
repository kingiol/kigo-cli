/**
 * Status line for displaying session info
 */

import chalk from 'chalk';

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  requestCount: number;
  lastInputTokens: number;
  lastOutputTokens: number;
  currentContextTokens: number;
}

export class StatusLine {
  private sessionId: string;
  private usage: SessionUsage;
  private model: string;

  constructor(sessionId: string, model: string) {
    this.sessionId = sessionId;
    this.model = model;
    this.usage = {
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      requestCount: 0,
      lastInputTokens: 0,
      lastOutputTokens: 0,
      currentContextTokens: 0,
    };
  }

  updateUsage(usage: SessionUsage): void {
    this.usage = usage;
  }

  setModel(model: string): void {
    this.model = model;
  }

  render(): string {
    const parts: string[] = [];

    // Session ID (shortened)
    const shortId = this.sessionId.split('_').pop() || this.sessionId;
    parts.push(chalk.dim(`[${shortId}]`));

    // Model
    parts.push(chalk.cyan(this.model));

    // Tokens
    const totalTokens = this.usage.inputTokens + this.usage.outputTokens;
    if (totalTokens > 0) {
      parts.push(chalk.dim(`${totalTokens.toLocaleString()} tokens`));
    }

    // Cost
    if (this.usage.totalCost > 0) {
      parts.push(chalk.dim(`$${this.usage.totalCost.toFixed(4)}`));
    }

    return parts.join(' ');
  }

  renderCompact(): string {
    const parts: string[] = [];

    const totalTokens = this.usage.inputTokens + this.usage.outputTokens;
    if (totalTokens > 0) {
      parts.push(chalk.dim(`${totalTokens}t`));
    }

    if (this.usage.totalCost > 0) {
      parts.push(chalk.dim(`$${this.usage.totalCost.toFixed(3)}`));
    }

    return parts.join(' ');
  }
}