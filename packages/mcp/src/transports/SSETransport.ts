/**
 * SSE (Server-Sent Events) transport for MCP
 * Implements the HTTP+SSE transport as specified in MCP protocol
 */

import { ErrorEvent, EventSource } from 'eventsource';
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
        // console.log('[SSE] Connection opened');
        this.connected = true;
        // Don't resolve yet - wait for endpoint event
      };

      this.eventSource!.onerror = (error: ErrorEvent) => {
        console.error('[SSE] Connection error:', error);
        this.connected = false;
        if (!endpointReceived) {
          clearTimeout(timeout);
          reject(new Error('SSE connection failed'));
        }
      };


      // Handle the endpoint event
      // Note: Server may send multiple endpoint events with new sessionIds
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

            // console.log('[SSE] Endpoint updated:', this.postUrl);

            // Only resolve the connection promise on the first endpoint event
            if (!endpointReceived) {
              endpointReceived = true;
              clearTimeout(timeout);
              resolve();
            }
          } else {
            throw new Error('No endpoint URL found in event data');
          }
        } catch (error) {
          console.error('[SSE] Failed to parse endpoint event:', error);
          if (!endpointReceived) {
            clearTimeout(timeout);
            reject(new Error('Invalid endpoint event'));
          }
        }
      });

      // Handle regular messages (JSON-RPC responses and server-initiated messages)
      this.eventSource!.addEventListener('message', (event: Event) => {
        const messageEvent = event as MessageEvent;
        // console.log('[SSE] Received message event:', messageEvent.data);
        try {
          const message = JSON.parse(messageEvent.data);
          // console.log('[SSE] Parsed message:', message);

          // Check if this is a response to a client request
          if ('id' in message && message.id !== null && message.id !== undefined) {
            // This is a response
            // console.log(`[SSE] Received response for request ${message.id}`);
            const callback = this.pendingRequests.get(Number(message.id));
            if (callback) {
              // console.log(`[SSE] Resolving request ${message.id}`);
              callback(message as JSONRPCResponse);
              this.pendingRequests.delete(Number(message.id));
            } else {
              console.warn(`[SSE] No pending request found for id ${message.id}`);
            }
          } else {
            // This is a server-initiated request or notification
            // console.log('[SSE] Received server-initiated message');
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

      // console.log(`[SSE] Sending request ${id}: ${method}`);
      // console.log(`[SSE] POST URL: ${this.postUrl}`);
      // console.log(`[SSE] Request body:`, JSON.stringify(request, null, 2));

      // Send request to the POST endpoint provided by the server
      // According to MCP SSE spec, the response will come via SSE stream
      // We don't wait for or read the HTTP response body
      fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(request),
      })
        .then(async (response) => {
          // console.log(`[SSE] POST response status: ${response.status} ${response.statusText}`);
          // console.log(`[SSE] Response headers:`, Object.fromEntries(response.headers.entries()));

          if (!response.ok) {
            console.error(`[SSE] POST request failed with status ${response.status}`);
            // Try to read error body
            try {
              const errorText = await response.text();
              console.error(`[SSE] Error response body:`, errorText);
            } catch (e) {
              console.error(`[SSE] Could not read error body:`, e);
            }
            this.pendingRequests.delete(id);
            reject(new Error(`HTTP error: ${response.status}`));
            return;
          }

          // POST succeeded - response will come via SSE
          // console.log(`[SSE] Request ${id} sent successfully, waiting for SSE response...`);

          // Don't read the response body - it might be empty or cause hanging
          // The actual JSON-RPC response will arrive via the SSE stream
        })
        .catch((error) => {
          console.error(`[SSE] POST request error:`, error);
          this.pendingRequests.delete(id);
          reject(error);
        });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          console.error(`[SSE] Request ${id} timed out after 30s`);
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000);
    });
  }

  async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.postUrl) {
      throw new Error('POST endpoint not available - connection not established');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    // console.log(`[SSE] Sending notification: ${method}`);
    // console.log(`[SSE] Notification body:`, JSON.stringify(notification, null, 2));

    // Send notification to the POST endpoint
    // Notifications don't have an id and don't expect a response
    await fetch(this.postUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(notification),
    })
      .then(async (response) => {
        // console.log(`[SSE] Notification POST response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          console.error(`[SSE] Notification POST failed with status ${response.status}`);
          throw new Error(`HTTP error: ${response.status}`);
        }

        // console.log(`[SSE] Notification ${method} sent successfully`);
      })
      .catch((error) => {
        console.error(`[SSE] Notification POST error:`, error);
        throw error;
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