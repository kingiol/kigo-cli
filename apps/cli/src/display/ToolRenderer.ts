import chalk from 'chalk';

export class ToolRenderer {
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
        const outputStr = typeof result === 'string' ? result : JSON.stringify(result);

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
}
