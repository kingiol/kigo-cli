/**
 * MCP (Model Context Protocol) types
 */

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPServerConfig {
  name: string;
  transportType: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  envVars?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  allowedTools?: string[];
  blockedTools?: string[];
}