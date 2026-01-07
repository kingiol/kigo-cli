/**
 * MCP Manager for integrating MCP tools with the Agent
 */

import { MCPClient } from './client.js';
import type { MCPServerConfig } from './types.js';

export interface MCPToolWrapper {
  name: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<string>;
  mcpServer: string;
}

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private tools: Map<string, MCPToolWrapper> = new Map();

  async initialize(servers: MCPServerConfig[]): Promise<void> {
    for (const serverConfig of servers) {
      try {
        const client = new MCPClient(serverConfig);
        await client.connect();

        this.clients.set(serverConfig.name, client);

        // Register tools from this server
        const mcpTools = client.getTools();
        for (const mcpTool of mcpTools) {
          const tool: MCPToolWrapper = {
            name: mcpTool.name,
            description: mcpTool.description,
            parameters: mcpTool.inputSchema,
            execute: async (args: any) => {
              const result = await client.callTool(mcpTool.name, args);
              return JSON.stringify(result);
            },
            mcpServer: serverConfig.name,
          };
          this.tools.set(mcpTool.name, tool);
        }
      } catch (error) {
        console.warn(`Failed to connect to MCP server "${serverConfig.name}": ${error}`);
      }
    }
  }

  getTools(): MCPToolWrapper[] {
    return Array.from(this.tools.values());
  }

  getTool(name: string): MCPToolWrapper | undefined {
    return this.tools.get(name);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getMCPServerForTool(name: string): string | undefined {
    return this.tools.get(name)?.mcpServer;
  }

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.close();
      } catch (error) {
        console.warn(`Error closing MCP client: ${error}`);
      }
    }
    this.clients.clear();
    this.tools.clear();
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  getToolCount(): number {
    return this.tools.size;
  }
}