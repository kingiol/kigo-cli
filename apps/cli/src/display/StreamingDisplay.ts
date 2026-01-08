/**
 * Streaming display manager for terminal output
 */

import chalk from 'chalk';
import { ToolRenderer } from './ToolRenderer.js';

export interface StreamingEvent {
  type: 'text_delta' | 'tool_call' | 'tool_output' | 'done' | 'error';
  data: any;
}

export interface OutputSection {
  type: 'text' | 'tool_call' | 'tool_output';
  content: string;
  toolName?: string;
}

export class StreamingDisplayManager {
  private sections: OutputSection[] = [];
  private currentText = '';
  private pendingToolCalls = 0;
  private toolNames = new Map<string, string>();

  handleEvent(event: StreamingEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.currentText += event.data;
        break;

      case 'tool_call':
        this.toolNames.set(event.data.id, event.data.name);

        let args = {};
        try {
          args = JSON.parse(event.data.arguments || '{}');
        } catch (e) {
          args = { raw: event.data.arguments };
        }

        this.sections.push({
          type: 'tool_call',
          content: ToolRenderer.renderToolCall(event.data.name, args),
          toolName: event.data.name,
        });
        this.pendingToolCalls++;
        break;

      case 'tool_output':
        const name = this.toolNames.get(event.data.id) || 'tool';
        let output = '';
        if (event.data.error) {
          output = chalk.red(`Error: ${event.data.error}\n`);
        } else {
          output = ToolRenderer.renderToolOutput(name, event.data.result);
        }

        this.sections.push({
          type: 'tool_output',
          content: output,
        });
        this.pendingToolCalls--;
        break;

      case 'error':
        // Add error as a text section
        this.sections.push({
          type: 'text',
          content: chalk.red(`Error: ${event.data}`),
        });
        break;

      case 'done':
        if (this.currentText) {
          this.sections.push({
            type: 'text',
            content: this.currentText,
          });
          this.currentText = '';
        }
        break;
    }
  }

  // formatToolOutput removed as it is now handled in handleEvent via ToolRenderer

  render(): string {
    let output = '';

    for (const section of this.sections) {
      switch (section.type) {
        case 'text':
          output += this.renderMarkdown(section.content);
          break;

        case 'tool_call':
        case 'tool_output':
          output += section.content;
          break;
      }
    }

    // Add current text if no pending tool calls
    if (this.currentText && this.pendingToolCalls === 0) {
      output += this.renderMarkdown(this.currentText);
    }

    return output;
  }

  private renderMarkdown(text: string): string {
    let rendered = text;

    // Code blocks
    rendered = rendered.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const langName = lang || 'code';
      return `\n${chalk.cyan(langName)}:\n${chalk.gray(code)}\n`;
    });

    // Inline code
    rendered = rendered.replace(/`([^`]+)`/g, (_, code) => {
      return chalk.cyan(`\`${code}\``);
    });

    // Bold
    rendered = rendered.replace(/\*\*([^*]+)\*\*/g, (_, text) => {
      return chalk.bold(text);
    });

    // Italic
    rendered = rendered.replace(/\*([^*]+)\*/g, (_, text) => {
      return chalk.italic(text);
    });

    // Headers
    rendered = rendered.replace(/^### (.+)$/gm, (_, text) => {
      return chalk.bold(text);
    });

    // Links
    rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      return chalk.blue.underline(text) + chalk.dim(` (${url})`);
    });

    return rendered;
  }

  reset(): void {
    this.sections = [];
    this.currentText = '';
    this.pendingToolCalls = 0;
  }

  getCurrentText(): string {
    return this.currentText;
  }

  getPendingToolCalls(): number {
    return this.pendingToolCalls;
  }
}