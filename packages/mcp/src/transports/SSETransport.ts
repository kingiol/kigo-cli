/**
 * SSE (Server-Sent Events) transport for MCP
 */

import type { JSONRPCRequest, JSONRPCResponse } from '../types.js';
import type { Transport } from './Transport.js';

export class SSETransport implements Transport {
  private eventSource: EventSource | null = null;
  private pendingRequests = new Map<number, (response: JSONRPCResponse) => void>();
  private messageId = 0;
  private baseUrl: string = '';
  private headers: Record<string, string> = {};
  private connected = false;

  async connect(config: {
    url: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    this.baseUrl = config.url;
    this.headers = config.headers || {};

    // For SSE, we need to connect to the endpoint
    // Note: EventSource doesn't support custom headers in all browsers,
    // but in Node.js we can use a polyfill or fetch-based approach
    this.eventSource = new EventSource(this.baseUrl);

    this.eventSource.onopen = () => {
      this.connected = true;
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      this.connected = false;
    };

    this.eventSource.onmessage = (event) => {
      try {
        const response: JSONRPCResponse = JSON.parse(event.data);
        const callback = this.pendingRequests.get(Number(response.id));
        if (callback) {
          callback(response);
          this.pendingRequests.delete(Number(response.id));
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error, event.data);
      }
    };

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE connection timeout'));
      }, 10000);

      this.eventSource!.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        resolve();
      };

      this.eventSource!.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('SSE connection failed'));
      };
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

      // For SSE, we typically send requests via HTTP POST
      fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(request),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
          }
          const result = await response.json() as JSONRPCResponse;
          this.pendingRequests.delete(id);
          resolve(result);
        })
        .catch((error) => {
          this.pendingRequests.delete(id);
          reject(error);
        });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.pendingRequests.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.eventSource !== null;
  }
}