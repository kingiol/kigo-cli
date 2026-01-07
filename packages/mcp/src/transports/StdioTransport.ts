/**
 * Stdio transport for MCP
 */

import { spawn, ChildProcess } from 'node:child_process';
import type { JSONRPCRequest, JSONRPCResponse } from '../types.js';
import type { Transport } from './Transport.js';

export class StdioTransport implements Transport {
  private proc: ChildProcess | null = null;
  private pendingRequests = new Map<number, (response: JSONRPCResponse) => void>();
  private messageId = 0;
  private messageBuffer = '';

  async connect(config: {
    command: string;
    args?: string[];
    envVars?: Record<string, string>;
  }): Promise<void> {
    this.proc = spawn(config.command, config.args || [], {
      env: { ...process.env, ...config.envVars },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (data: Buffer) => {
      this.messageBuffer += data.toString();

      // Process complete JSON-RPC messages
      const lines = this.messageBuffer.split('\n');
      this.messageBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response: JSONRPCResponse = JSON.parse(line);
          const callback = this.pendingRequests.get(Number(response.id));
          if (callback) {
            callback(response);
            this.pendingRequests.delete(Number(response.id));
          }
        } catch (error) {
          console.error('Failed to parse MCP response:', error, line);
        }
      }
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      console.error('MCP stderr:', data.toString());
    });

    this.proc.on('close', (code: number) => {
      console.log(`MCP process exited with code ${code}`);
    });

    this.proc.on('error', (error: Error) => {
      console.error('MCP process error:', error);
    });
  }

  async send(method: string, params?: any): Promise<JSONRPCResponse> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingRequests.set(id, resolve);

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.proc?.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('MCP request timeout'));
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    this.pendingRequests.clear();
  }

  isConnected(): boolean {
    return this.proc !== null && !this.proc.killed;
  }
}