/**
 * Streaming display manager for terminal output
 */

import chalk from 'chalk';

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

  handleEvent(event: StreamingEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.currentText += event.data;
        break;

      case 'tool_call':
        this.sections.push({
          type: 'tool_call',
          content: JSON.stringify(event.data),
          toolName: event.data.name,
        });
        this.pendingToolCalls++;
        break;

      case 'tool_output':
        this.sections.push({
          type: 'tool_output',
          content: this.formatToolOutput(event.data),
        });
        this.pendingToolCalls--;
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

  private formatToolOutput(data: any): string {
    if (data.error) {
      return chalk.red(`Error: ${data.error}`);
    }
    // Truncate long output
    const result = String(data.result || '');
    if (result.length > 500) {
      return result.substring(0, 500) + '...';
    }
    return result;
  }

  render(): string {
    let output = '';

    for (const section of this.sections) {
      switch (section.type) {
        case 'text':
          output += this.renderMarkdown(section.content);
          break;

        case 'tool_call':
          output += `\n${chalk.gray('▶')} ${chalk.cyan(section.toolName || 'tool')}`;
          break;

        case 'tool_output':
          output += `\n${chalk.dim(section.content)}`;
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