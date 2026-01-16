import chalk from 'chalk';

export class ToolRenderer {
    private static readonly MAX_OUTPUT_LINES = 200;
    private static readonly MAX_OUTPUT_CHARS = 8000;
    private static readonly DIFF_OUTPUT_LINES = 400;
    private static readonly DIFF_OUTPUT_CHARS = 16000;

    static renderToolCall(name: string, args: any): string {
        const argsStr = JSON.stringify(args);
        const truncatedArgs = argsStr.length > 100 ? argsStr.substring(0, 100) + '...' : argsStr;
        let output = `${chalk.blue('●')} ${chalk.bold(name)}(${chalk.dim(truncatedArgs)})\n`;

        if (name === 'todo_write' && args.todos && Array.isArray(args.todos)) {
            output += this.renderTodoList(args.todos);
        }

        return output;
    }

    static renderToolOutput(name: string, result: any): string {
        const rawOutput = typeof result === 'string' ? result : JSON.stringify(result);
        const outputStr = this.truncateOutput(rawOutput, name);

        // Colorize diffs for write_file
        let formattedOutput = outputStr;
        if (name === 'write_file' || name === 'edit_file') {
            formattedOutput = outputStr.split('\n').map(line => {
                if (line.startsWith('+')) return chalk.green(line);
                if (line.startsWith('-')) return chalk.red(line);
                if (line.startsWith('@')) return chalk.cyan(line);
                return line;
            }).join('\n');
        }

        // Indent the output
        const indentedOutput = formattedOutput.split('\n').map((line, i) => {
            if (i === 0) return `  ${chalk.gray('╰─')} ${line}`;
            return `     ${line}`;
        }).join('\n');

        return indentedOutput + '\n';
    }

    private static renderTodoList(todos: any[]): string {
        let output = '';
        const statusMap: Record<string, string> = {
            pending: '⏳',
            in_progress: '🔄',
            completed: '✅',
        };

        for (const todo of todos) {
            const icon = statusMap[todo.status] || '⬜';
            output += `     ${icon} ${todo.content}\n`;
        }
        return output;
    }

    private static truncateOutput(outputStr: string, name: string): string {
        const isDiffLike = name === 'write_file' || name === 'edit_file';
        const maxLines = isDiffLike ? this.DIFF_OUTPUT_LINES : this.MAX_OUTPUT_LINES;
        const maxChars = isDiffLike ? this.DIFF_OUTPUT_CHARS : this.MAX_OUTPUT_CHARS;
        let lines = outputStr.split('\n');
        let remainingLines = 0;

        if (lines.length > maxLines) {
            remainingLines = lines.length - maxLines;
            lines = lines.slice(0, maxLines);
        }

        let text = lines.join('\n');
        let truncated = remainingLines > 0;

        if (text.length > maxChars) {
            text = text.slice(0, maxChars);
            truncated = true;
        }

        if (truncated) {
            const more = remainingLines > 0 ? `... ${remainingLines} more lines` : '... output truncated';
            text += `\n${chalk.dim(more)}`;
        }

        return text;
    }
}
