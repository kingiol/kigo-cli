/**
 * Session management with SQLite storage
 */

import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Message, Usage, SessionUsage } from '../types.js';

export interface SessionMetadata {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

const DEFAULT_DB_PATH = path.join(os.homedir(), '.koder', 'koder.db');

export class Session {
  private db: Database.Database;
  private sessionId: string;
  private usage: SessionUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
    requestCount: 0,
    lastInputTokens: 0,
    lastOutputTokens: 0,
    currentContextTokens: 0,
  };

  constructor(sessionId?: string, dbPath: string = DEFAULT_DB_PATH) {
    this.sessionId = sessionId || this.generateId();
    const dbDir = path.dirname(dbPath);

    // Ensure directory exists
    try {
      const fs = require('node:fs');
      fs.mkdirSync(dbDir, { recursive: true });
    } catch {
      // Ignore
    }

    this.db = new Database(dbPath);
    this.initTables();
    this.loadUsage();
  }

  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_call_id TEXT,
        tool_calls TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_metadata (
        session_id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        message_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS session_usage (
        session_id TEXT PRIMARY KEY,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        request_count INTEGER DEFAULT 0,
        last_input_tokens INTEGER DEFAULT 0,
        last_output_tokens INTEGER DEFAULT 0,
        current_context_tokens INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_items_session ON items(session_id);
      CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at);
    `);
  }

  getId(): string {
    return this.sessionId;
  }

  async saveMessage(message: Message): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO items (session_id, role, content, tool_call_id, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      this.sessionId,
      message.role,
      message.content,
      message.toolCallId || null,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      Date.now()
    );

    this.updateMetadata();
  }

  async saveMessages(messages: Message[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO items (session_id, role, content, tool_call_id, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((msgs: Message[]) => {
      for (const msg of msgs) {
        stmt.run(
          this.sessionId,
          msg.role,
          msg.content,
          msg.toolCallId || null,
          msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          Date.now()
        );
      }
    });

    insertMany(messages);
    this.updateMetadata();
  }

  async getMessages(limit?: number): Promise<Message[]> {
    let query = `
      SELECT role, content, tool_call_id, tool_calls
      FROM items
      WHERE session_id = ?
      ORDER BY id ASC
    `;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const stmt = this.db.prepare(query);
    const rows: any[] = stmt.all(this.sessionId);

    return rows.map(row => ({
      role: row.role,
      content: row.content,
      toolCallId: row.tool_call_id,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    }));
  }

  async getMessagesSince(timestamp: number): Promise<Message[]> {
    const stmt = this.db.prepare(`
      SELECT role, content, tool_call_id, tool_calls
      FROM items
      WHERE session_id = ? AND created_at > ?
      ORDER BY id ASC
    `);

    const rows: any[] = stmt.all(this.sessionId, timestamp);

    return rows.map(row => ({
      role: row.role,
      content: row.content,
      toolCallId: row.tool_call_id,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    }));
  }

  async setTitle(title: string | null): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO session_metadata (session_id, title, created_at, updated_at, message_count)
      VALUES (?, ?, COALESCE((SELECT created_at FROM session_metadata WHERE session_id = ?), ?), ?, COALESCE((SELECT message_count FROM session_metadata WHERE session_id = ?), 0))
      ON CONFLICT(session_id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at
    `);

    const now = Date.now();
    stmt.run(this.sessionId, title, this.sessionId, now, now, this.sessionId);
  }

  getTitle(): string | null {
    const stmt = this.db.prepare(`
      SELECT title FROM session_metadata WHERE session_id = ?
    `);

    const row: any = stmt.get(this.sessionId);
    return row?.title || null;
  }

  async listSessions(limit: number = 50): Promise<SessionMetadata[]> {
    const stmt = this.db.prepare(`
      SELECT session_id, title, created_at, updated_at, message_count
      FROM session_metadata
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    return stmt.all(limit) as SessionMetadata[];
  }

  async deleteSession(sessionId: string): Promise<void> {
    const deleteItems = this.db.prepare('DELETE FROM items WHERE session_id = ?');
    const deleteMetadata = this.db.prepare('DELETE FROM session_metadata WHERE session_id = ?');
    const deleteUsage = this.db.prepare('DELETE FROM session_usage WHERE session_id = ?');

    const del = this.db.transaction(() => {
      deleteItems.run(sessionId);
      deleteMetadata.run(sessionId);
      deleteUsage.run(sessionId);
    });

    del();
  }

  recordUsage(usage: Usage, cost?: number): void {
    this.usage.inputTokens += usage.inputTokens;
    this.usage.outputTokens += usage.outputTokens;
    this.usage.requestCount += 1;
    this.usage.lastInputTokens = usage.inputTokens;
    this.usage.lastOutputTokens = usage.outputTokens;
    this.usage.totalCost += cost || 0;

    this.saveUsage();
  }

  getContextTokenCount(): number {
    // Estimate based on stored messages
    const stmt = this.db.prepare(`
      SELECT SUM(LENGTH(content)) as total_chars
      FROM items
      WHERE session_id = ?
    `);

    const row: any = stmt.get(this.sessionId);
    const totalChars = row?.total_chars || 0;

    // Rough estimate: 4 chars per token
    return Math.ceil(totalChars / 4);
  }

  getUsage(): SessionUsage {
    return { ...this.usage };
  }

  updateContextTokens(tokens: number): void {
    this.usage.currentContextTokens = tokens;
    this.saveUsage();
  }

  private loadUsage(): void {
    const stmt = this.db.prepare(`
      SELECT * FROM session_usage WHERE session_id = ?
    `);

    const row: any = stmt.get(this.sessionId);
    if (row) {
      this.usage = {
        inputTokens: row.input_tokens || 0,
        outputTokens: row.output_tokens || 0,
        totalCost: row.total_cost || 0,
        requestCount: row.request_count || 0,
        lastInputTokens: row.last_input_tokens || 0,
        lastOutputTokens: row.last_output_tokens || 0,
        currentContextTokens: row.current_context_tokens || 0,
      };
    }
  }

  private saveUsage(): void {
    const stmt = this.db.prepare(`
      INSERT INTO session_usage (session_id, input_tokens, output_tokens, total_cost, request_count, last_input_tokens, last_output_tokens, current_context_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        total_cost = excluded.total_cost,
        request_count = excluded.request_count,
        last_input_tokens = excluded.last_input_tokens,
        last_output_tokens = excluded.last_output_tokens,
        current_context_tokens = excluded.current_context_tokens
    `);

    stmt.run(
      this.sessionId,
      this.usage.inputTokens,
      this.usage.outputTokens,
      this.usage.totalCost,
      this.usage.requestCount,
      this.usage.lastInputTokens,
      this.usage.lastOutputTokens,
      this.usage.currentContextTokens
    );
  }

  private updateMetadata(): void {
    const stmt = this.db.prepare(`
      INSERT INTO session_metadata (session_id, title, created_at, updated_at, message_count)
      VALUES (?, COALESCE((SELECT title FROM session_metadata WHERE session_id = ?), NULL), COALESCE((SELECT created_at FROM session_metadata WHERE session_id = ?), ?), ?, COALESCE((SELECT message_count FROM session_metadata WHERE session_id = ?), 0) + 1)
      ON CONFLICT(session_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        message_count = excluded.message_count
    `);

    const now = Date.now();
    stmt.run(this.sessionId, this.sessionId, this.sessionId, now, now, this.sessionId);
  }

  reset(): void {
    const stmt = this.db.prepare('DELETE FROM items WHERE session_id = ?');
    stmt.run(this.sessionId);
    this.updateMetadata();
  }

  close(): void {
    this.db.close();
  }
}