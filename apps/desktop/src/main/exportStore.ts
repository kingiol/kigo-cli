import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSessionMessages } from './sessionStore.js';
import { loadAudit } from './auditStore.js';

const EXPORT_DIR = path.join(os.homedir(), '.kigo', 'desktop-exports');

async function ensureExportDir(): Promise<void> {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
}

export async function exportSession(sessionId: string, format: 'markdown' | 'json'): Promise<string> {
  await ensureExportDir();
  const messages = await loadSessionMessages(sessionId);
  const exportedAt = new Date().toISOString();

  if (format === 'json') {
    const payload = { sessionId, exportedAt, messages };
    const filePath = path.join(EXPORT_DIR, `${sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return filePath;
  }

  const markdownLines = [`# Session ${sessionId}`, '', `Exported: ${exportedAt}`, ''];
  for (const message of messages) {
    markdownLines.push(`## ${message.role.toUpperCase()}`);
    markdownLines.push('');
    markdownLines.push(message.content || '');
    markdownLines.push('');
  }

  const filePath = path.join(EXPORT_DIR, `${sessionId}.md`);
  await fs.writeFile(filePath, markdownLines.join('\n'), 'utf-8');
  return filePath;
}

export async function exportAudit(sessionId: string, format: 'jsonl' | 'json'): Promise<string> {
  await ensureExportDir();
  const records = await loadAudit(sessionId);

  if (format === 'json') {
    const payload = { sessionId, exportedAt: new Date().toISOString(), records };
    const filePath = path.join(EXPORT_DIR, `${sessionId}.audit.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return filePath;
  }

  const filePath = path.join(EXPORT_DIR, `${sessionId}.audit.jsonl`);
  const content = records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}
