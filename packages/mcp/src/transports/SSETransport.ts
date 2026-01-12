/**
 * SSE (Server-Sent Events) transport for MCP
 * Implements the HTTP+SSE transport as specified in MCP protocol
 */

import { EventSource } from 'eventsource';
import type { JSONRPCRequest, JSONRPCResponse, JSONRPCNotification } from '../types.js';
import type { Transport } from './Transport.js';

export class SSETransport implements Transport {
  private eventSource: EventSource | null = null;
  private pendingRequests = new Map<number, (response: JSONRPCResponse) => void>();
  private messageId = 0;
  private sseUrl: string = '';
  private postUrl: string = '';
  private headers: Record<string, string> = {};
  private connected = false;
  private onServerMessage?: (message: JSONRPCRequest | JSONRPCNotification) => void;

  /**
   * Set a callback to handle server-initiated messages (requests and notifications)
   */
  setServerMessageHandler(handler: (message: JSONRPCRequest | JSONRPCNotification) => void): void {
    this.onServerMessage = handler;
  }

  async connect(config: {
    url: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    this.sseUrl = config.url;
    this.headers = config.headers || {};

    // For SSE, we need to connect to the SSE endpoint
    // Note: EventSource doesn't support custom headers in browsers,
    // but in Node.js we can use eventsource package which supports headers
    this.eventSource = new EventSource(this.sseUrl);

    // Wait for connection and endpoint event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE connection timeout'));
      }, 10000);

      let endpointReceived = false;

      this.eventSource!.onopen = () => {
        this.connected = true;
        // Don't resolve yet - wait for endpoint event
      };

      this.eventSource!.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.connected = false;
        if (!endpointReceived) {
          clearTimeout(timeout);
          reject(new Error('SSE connection failed'));
        }
      };

      // Handle the endpoint event
      this.eventSource!.addEventListener('endpoint', (event: Event) => {
        try {
          const messageEvent = event as MessageEvent;
          const data = messageEvent.data;

          // The endpoint data can be either a plain URL string or a JSON object with uri field
          let endpointUrl: string;

          if (typeof data === 'string') {
            // Try to parse as JSON first
            try {
              const parsed = JSON.parse(data);
              endpointUrl = parsed.uri || parsed.url || parsed;
            } catch {
              // If not JSON, treat as plain URL string
              endpointUrl = data;
            }
          } else {
            endpointUrl = data.uri || data.url || data;
          }

          if (endpointUrl) {
            // If the URL is relative, make it absolute using the SSE URL as base
            if (endpointUrl.startsWith('/')) {
              const baseUrl = new URL(this.sseUrl);
              this.postUrl = `${baseUrl.origin}${endpointUrl}`;
            } else {
              this.postUrl = endpointUrl;
            }

            console.log('SSE endpoint configured:', this.postUrl);
            endpointReceived = true;
            clearTimeout(timeout);
            resolve();
          } else {
            throw new Error('No endpoint URL found in event data');
          }
        } catch (error) {
          console.error('Failed to parse endpoint event:', error);
          clearTimeout(timeout);
          reject(new Error('Invalid endpoint event'));
        }
      });

      // Handle regular messages (JSON-RPC responses and server-initiated messages)
      this.eventSource!.addEventListener('message', (event: Event) => {
        const messageEvent = event as MessageEvent;
        try {
          const message = JSON.parse(messageEvent.data);

          // Check if this is a response to a client request
          if ('id' in message && message.id !== null && message.id !== undefined) {
            // This is a response
            const callback = this.pendingRequests.get(Number(message.id));
            if (callback) {
              callback(message as JSONRPCResponse);
              this.pendingRequests.delete(Number(message.id));
            }
          } else {
            // This is a server-initiated request or notification
            if (this.onServerMessage) {
              this.onServerMessage(message);
            } else {
              console.warn('Received server message but no handler set:', message);
            }
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error, messageEvent.data);
        }
      });
    });
  }

  async send(method: string, params?: any): Promise<JSONRPCResponse> {
    if (!this.postUrl) {
      throw new Error('POST endpoint not available - connection not established');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingRequests.set(id, resolve);

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      // Create an AbortController to cancel the fetch after we get the status
      const abortController = new AbortController();

      // Send request to the POST endpoint provided by the server
      // The response will come via SSE, not in the HTTP response
      fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            this.pendingRequests.delete(id);
            reject(new Error(`HTTP error: ${response.status}`));
            abortController.abort();
            return;
          }

          // According to MCP SSE spec, the response comes via SSE stream
          // The HTTP POST just needs to succeed (200/202)
          // We abort the fetch to avoid waiting for the response body
          console.log(`Request ${id} sent successfully, waiting for SSE response...`);
          abortController.abort(); // Abort to close the connection immediately
        })
        .catch((error) => {
          // Ignore abort errors, they're expected
          if (error.name === 'AbortError') {
            return;
          }
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
    this.postUrl = '';
  }

  isConnected(): boolean {
    return this.connected && this.eventSource !== null && this.postUrl !== '';
  }
}