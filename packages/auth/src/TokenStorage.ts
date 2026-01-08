/**
 * Token storage for OAuth
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface OAuthTokens {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in milliseconds
  email?: string;
  models?: string[];
  modelsFetchedAt?: number;
}

const TOKENS_DIR = path.join(os.homedir(), '.kigo', 'tokens');
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000; // 1 minute buffer

export class TokenStorage {
  static async save(tokens: OAuthTokens): Promise<void> {
    await fs.mkdir(TOKENS_DIR, { recursive: true });
    const filePath = path.join(TOKENS_DIR, `${tokens.provider}.json`);
    await fs.writeFile(filePath, JSON.stringify(tokens, null, 2), 'utf-8');
    // Set restrictive permissions
    await fs.chmod(filePath, 0o600);
  }

  static async load(provider: string): Promise<OAuthTokens | null> {
    try {
      const filePath = path.join(TOKENS_DIR, `${provider}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  static async delete(provider: string): Promise<void> {
    try {
      const filePath = path.join(TOKENS_DIR, `${provider}.json`);
      await fs.unlink(filePath);
    } catch {
      // Ignore errors
    }
  }

  static async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(TOKENS_DIR);
      return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  static isExpired(tokens: OAuthTokens, bufferMs: number = TOKEN_EXPIRY_BUFFER_MS): boolean {
    return Date.now() >= tokens.expiresAt - bufferMs;
  }

  static isModelsCacheValid(tokens: OAuthTokens, ttlMs: number = 24 * 60 * 60 * 1000): boolean {
    if (!tokens.modelsFetchedAt) {
      return false;
    }
    return Date.now() < tokens.modelsFetchedAt + ttlMs;
  }
}