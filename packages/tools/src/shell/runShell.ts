/**
 * Run shell command tool
 */

import { z } from 'zod';
import { tool } from '../registry.js';
import { SecurityGuard } from '../security.js';
import { spawn } from 'node:child_process';

// Background shell manager
class BackgroundShellManager {
  private static shells = new Map<string, { process: any; output: string[]; status: string }>();
  private static shellIdCounter = 0;

  static spawn(command: string, timeout: number = 300000): string {
    const shellId = `shell_${++this.shellIdCounter}`;

    const proc = spawn('bash', ['-c', command], {
      timeout,
    });

    const output: string[] = [];

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    proc.on('close', (code: number) => {
      this.shells.get(shellId)!.status = code === 0 ? 'completed' : 'failed';
    });

    this.shells.set(shellId, {
      process: proc,
      output,
      status: 'running',
    });

    return shellId;
  }

  static getOutput(shellId: string): string | null {
    const shell = this.shells.get(shellId);
    if (!shell) return null;
    return shell.output.join('');
  }

  static kill(shellId: string): boolean {
    const shell = this.shells.get(shellId);
    if (!shell) return false;
    shell.process.kill();
    shell.status = 'killed';
    return true;
  }

  static getStatus(shellId: string): string | null {
    const shell = this.shells.get(shellId);
    return shell?.status || null;
  }

  static cleanup(): void {
    for (const [_id, shell] of this.shells) {
      if (shell.status === 'running') {
        shell.process.kill();
      }
    }
    this.shells.clear();
  }
}

export const runShellSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  timeout: z.number().min(1).max(600).default(120).describe('Timeout in seconds'),
  background: z.boolean().default(false).describe('Run command in background'),
});

tool({
  name: 'run_shell',
  description: 'Execute a shell command. Returns the output.',
  schema: runShellSchema,
  execute: async ({ command, timeout, background }) => {
    // Validate command
    const error = SecurityGuard.validateCommand(command);
    if (error) {
      return error;
    }

    if (background) {
      const shellId = BackgroundShellManager.spawn(command, timeout * 1000);
      return `Started background shell: ${shellId}`;
    }

    return new Promise((resolve, _reject) => {
      const proc = spawn('bash', ['-c', command], {
        timeout: timeout * 1000,
      });

      let _stdout = '';
      let _stderr = '';
      let combined = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        _stdout += text;
        combined += text;
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        _stderr += text;
        combined += text;
      });

      proc.on('close', (code: number) => {
        const output = SecurityGuard.filterSensitiveOutput(combined);
        if (code === 0) {
          resolve(output || 'Command completed successfully');
        } else {
          resolve(`Exit code ${code}:\n${output}`);
        }
      });

      proc.on('error', (err: Error) => {
        resolve(`Error: ${err.message}`);
      });
    });
  },
});

// Additional shell tools
tool({
  name: 'shell_output',
  description: 'Get output from a background shell',
  schema: z.object({
    shellId: z.string().describe('The shell ID to get output from'),
  }),
  execute: async ({ shellId }) => {
    const output = BackgroundShellManager.getOutput(shellId);
    const status = BackgroundShellManager.getStatus(shellId);

    if (!output) {
      return `Shell not found: ${shellId}`;
    }

    const filtered = SecurityGuard.filterSensitiveOutput(output);
    return `Status: ${status}\nOutput:\n${filtered}`;
  },
});

tool({
  name: 'shell_kill',
  description: 'Kill a background shell',
  schema: z.object({
    shellId: z.string().describe('The shell ID to kill'),
  }),
  execute: async ({ shellId }) => {
    const killed = BackgroundShellManager.kill(shellId);
    return killed ? `Killed shell: ${shellId}` : `Shell not found: ${shellId}`;
  },
});

tool({
  name: 'git_command',
  description: 'Execute a git command (auto-prefixed with "git")',
  schema: z.object({
    args: z.string().describe('Git command arguments'),
  }),
  execute: async ({ args }) => {
    const command = `git ${args}`;

    // Validate command (but allow all git commands)
    const error = SecurityGuard.validateCommand(command);
    if (error && !error.includes('git')) {
      return error;
    }

    return new Promise((resolve, _reject) => {
      const proc = spawn('git', args.split(' '), {
        timeout: 30000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (_code: number) => {
        const output = stdout || stderr;
        resolve(SecurityGuard.filterSensitiveOutput(output));
      });

      proc.on('error', (err: Error) => {
        resolve(`Error: ${err.message}`);
      });
    });
  },
});
