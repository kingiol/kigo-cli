/**
 * MCP client
 */

import { StdioTransport } from './transports/StdioTransport.js';
import { SSETransport } from './transports/SSETransport.js';
import { HTTPTransport } from './transports/HTTPTransport.js';
import type { Transport } from './transports/Transport.js';
import type { MCPServerConfig, MCPTool } from './types.js';

export class MCPClient {
  private transport: Transport;
  private tools: Map<string, MCPTool> = new Map();
  private initialized = false;

  constructor(private config: MCPServerConfig) {
    // Create the appropriate transport based on config
    switch (config.transportType) {
      case 'stdio':
        this.transport = new StdioTransport();
        break;
      case 'sse':
        this.transport = new SSETransport();
        break;
      case 'http':
        this.transport = new HTTPTransport();
        break;
      default:
        throw new Error(`Unsupported transport type: ${config.transportType}`);
    }
  }

  async connect(): Promise<void> {
    switch (this.config.transportType) {
      case 'stdio':
        await this.transport.connect({
          command: this.config.command!,
          args: this.config.args || [],
          envVars: this.config.envVars || {},
        });
        break;
      case 'sse':
      case 'http':
        await this.transport.connect({
          url: this.config.url!,
          headers: this.config.headers || {},
        });
        break;
    }

    // Initialize
    await this.initialize();
    await this.listTools();
  }

  private async initialize(): Promise<void> {
    const response = await this.transport.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'kigo-node',
        version: '0.1.0',
      },
    });

    if (response.error) {
      throw new Error(`MCP initialization failed: ${response.error.message}`);
    }

    this.initialized = true;
  }

  private async listTools(): Promise<void> {
    const response = await this.transport.send('tools/list');

    if (response.error) {
      console.warn(`Failed to list MCP tools: ${response.error.message}`);
      return;
    }

    const tools: MCPTool[] = response.result?.tools || [];
    for (const tool of tools) {
      // Apply filters
      if (this.config.allowedTools && !this.config.allowedTools.includes(tool.name)) {
        continue;
      }
      if (this.config.blockedTools?.includes(tool.name)) {
        continue;
      }
      this.tools.set(tool.name, tool);
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    const response = await this.transport.send('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      throw new Error(`MCP tool error: ${response.error.message}`);
    }

    return response.result;
  }

  getTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  async close(): Promise<void> {
    await this.transport.close();
    this.tools.clear();
    this.initialized = false;
  }
}