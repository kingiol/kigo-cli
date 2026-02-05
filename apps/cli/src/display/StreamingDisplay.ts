/**
 * Streaming display manager for terminal output
 */

import chalk from 'chalk';
import { ToolRenderer } from './ToolRenderer.js';

const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

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

      case 'tool_call': {
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
      }

      case 'tool_output': {
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
      }

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
    const lines = text.split(/\r?\n/);
    const outputLines: string[] = [];
    const width = getWrapWidth();
    let inCodeBlock = false;
    let codeLang = 'code';

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          codeLang = line.slice(3).trim() || 'code';
          outputLines.push(chalk.cyan(`${codeLang}:`));
          inCodeBlock = true;
        } else {
          inCodeBlock = false;
        }
        continue;
      }

      if (inCodeBlock) {
        outputLines.push(chalk.gray(line));
        continue;
      }

      if (!line.trim()) {
        outputLines.push('');
        continue;
      }

      const indentMatch = line.match(/^\s+/);
      const indent = indentMatch ? indentMatch[0] : '';
      const content = line.slice(indent.length);

      const headerMatch = content.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const headerText = headerMatch[2];
        outputLines.push(wrapWithPrefix(indent, chalk.bold(headerText), width));
        continue;
      }

      const quoteMatch = content.match(/^>\s+(.+)$/);
      if (quoteMatch) {
        const quoteText = renderInlineMarkdown(quoteMatch[1]);
        const prefix = `${indent}${chalk.dim('|')} `;
        outputLines.push(wrapWithPrefix(prefix, quoteText, width));
        continue;
      }

      const listMatch = content.match(/^([-*+]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        const bullet = listMatch[1];
        const listText = renderInlineMarkdown(listMatch[2]);
        const prefix = `${indent}${chalk.dim(bullet)} `;
        outputLines.push(wrapWithPrefix(prefix, listText, width));
        continue;
      }

      const formatted = renderInlineMarkdown(content);
      outputLines.push(wrapWithPrefix(indent, formatted, width));
    }

    return outputLines.join('\n');
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

function renderInlineMarkdown(text: string): string {
  let rendered = text;

  rendered = rendered.replace(/`([^`]+)`/g, (_, code) => chalk.cyan(`\`${code}\``));
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, (_, boldText) => chalk.bold(boldText));
  rendered = rendered.replace(/\*([^*]+)\*/g, (_, italicText) => chalk.italic(italicText));
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return chalk.blue.underline(label) + chalk.dim(` (${url})`);
  });

  return rendered;
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

function visibleLength(input: string): number {
  let length = 0;
  for (const char of stripAnsi(input)) {
    const code = char.codePointAt(0) ?? 0;
    length += code <= 0x7f ? 1 : 2;
  }
  return length;
}

function wrapWithPrefix(prefix: string, text: string, width: number): string {
  if (width <= 0) {
    return prefix + text;
  }

  const prefixLen = visibleLength(prefix);
  const available = Math.max(10, width - prefixLen);
  if (available <= 0) {
    return prefix + text;
  }

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let currentLen = 0;

  for (const word of words) {
    const wordLen = visibleLength(word);
    if (currentLen === 0) {
      current = word;
      currentLen = wordLen;
      continue;
    }

    if (currentLen + 1 + wordLen > available) {
      lines.push(current);
      current = word;
      currentLen = wordLen;
      continue;
    }

    current += ' ' + word;
    currentLen += 1 + wordLen;
  }

  if (currentLen > 0) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return prefix;
  }

  const continuation = ' '.repeat(prefixLen);
  return lines
    .map((line, index) => (index === 0 ? prefix + line : continuation + line))
    .join('\n');
}

function getWrapWidth(): number {
  const columns = process.stdout.columns;
  if (!columns || columns < 40) {
    return 80;
  }
  return columns - 2;
}
