import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type AuditRecord = {
  sessionId: string;
  timestamp: number;
  type: 'tool_call' | 'tool_output' | 'approval_request' | 'approval_decision';
  data: unknown;
};

const BASE_DIR = path.join(os.homedir(), '.kigo', 'desktop-audit');

function getAuditPath(sessionId: string): string {
  return path.join(BASE_DIR, `${sessionId}.jsonl`);
}

export async function appendAudit(record: AuditRecord): Promise<void> {
  await fs.mkdir(BASE_DIR, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(getAuditPath(record.sessionId), line, 'utf-8');
}

export async function loadAudit(sessionId: string): Promise<AuditRecord[]> {
  try {
    const content = await fs.readFile(getAuditPath(sessionId), 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
