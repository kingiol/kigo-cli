/**
 * HTTP transport for MCP
 */

import type { JSONRPCRequest, JSONRPCResponse } from '../types.js';
import type { Transport } from './Transport.js';

export class HTTPTransport implements Transport {
  private baseUrl: string = '';
  private headers: Record<string, string> = {};
  private connected = false;

  async connect(config: {
    url: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    this.baseUrl = config.url;
    this.headers = config.headers || {};

    // For HTTP, we verify connectivity with a simple request
    try {
      const response = await fetch(this.baseUrl, {
        method: 'GET',
        headers: this.headers,
      });
      if (response.ok) {
        this.connected = true;
      } else {
        throw new Error(`HTTP connection failed: ${response.status}`);
      }
    } catch (error) {
      // Some servers might not support GET, try with initialize
      try {
        const initRequest: JSONRPCRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'koder-node',
              version: '0.1.0',
            },
          },
        };

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.headers,
          },
          body: JSON.stringify(initRequest),
        });

        if (response.ok) {
          this.connected = true;
        } else {
          throw new Error(`HTTP connection failed: ${response.status}`);
        }
      } catch {
        throw new Error('HTTP connection failed');
      }
    }
  }

  async send(method: string, params?: any): Promise<JSONRPCResponse> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as JSONRPCResponse;

    if (result.error) {
      throw new Error(`MCP error: ${result.error.message}`);
    }

    return result;
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}