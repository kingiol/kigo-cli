/**
 * Transport interface for MCP
 */

import type { JSONRPCResponse } from '../types.js';

export interface Transport {
  connect(config: any): Promise<void>;
  send(method: string, params?: any): Promise<JSONRPCResponse>;
  close(): Promise<void>;
  isConnected(): boolean;
}