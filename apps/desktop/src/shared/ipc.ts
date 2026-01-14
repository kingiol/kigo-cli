import type { KigoConfig, MCPServerConfig } from '../../../cli/src/config/configSchema.js';

export const IPC_CHANNELS = {
  configGet: 'config:get',
  configSave: 'config:save',
  configPath: 'config:path',
  mcpList: 'mcp:list',
  mcpAdd: 'mcp:add',
  mcpRemove: 'mcp:remove',
  mcpTest: 'mcp:test',
  chatStart: 'chat:start',
  chatEvent: 'chat:event',
  chatApproval: 'chat:approval',
  chatApprove: 'chat:approve',
  sessionList: 'session:list',
  sessionLoad: 'session:load',
  sessionRename: 'session:rename',
  sessionDelete: 'session:delete',
  auditLoad: 'audit:load',
  exportSession: 'export:session',
  exportAudit: 'export:audit'
} as const;

export type ConfigGetResponse = {
  config: KigoConfig;
  path: string;
};

export type ConfigSavePayload = {
  config: KigoConfig;
};

export type ConfigPathResponse = {
  path: string;
};

export type MCPListResponse = {
  servers: MCPServerConfig[];
};

export type MCPAddPayload = {
  server: MCPServerConfig;
};

export type MCPAddResponse = {
  servers: MCPServerConfig[];
  path: string;
};

export type MCPRemovePayload = {
  name: string;
};

export type MCPRemoveResponse = {
  servers: MCPServerConfig[];
  path: string;
};

export type MCPTestPayload = {
  server: MCPServerConfig;
};

export type MCPTestResponse = {
  ok: boolean;
  message: string;
};

export type ChatStartPayload = {
  input: string;
  sessionId?: string;
};

export type ChatStartResponse = {
  sessionId: string;
};

export type ChatEventPayload = {
  sessionId: string;
  event: unknown;
};

export type ChatApprovalPayload = {
  sessionId: string;
  requestId: string;
  tool: {
    name: string;
    source: 'builtin' | 'mcp';
    params: unknown;
  };
};

export type ChatApprovePayload = {
  sessionId: string;
  requestId: string;
  approved: boolean;
};

export type SessionListResponse = {
  sessions: Array<{
    id: string;
    title: string | null;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
  }>;
};

export type SessionLoadPayload = {
  sessionId: string;
};

export type SessionLoadResponse = {
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
  }>;
};

export type SessionRenamePayload = {
  sessionId: string;
  title: string | null;
};

export type SessionDeletePayload = {
  sessionId: string;
};

export type AuditLoadPayload = {
  sessionId: string;
};

export type AuditLoadResponse = {
  records: Array<{
    sessionId: string;
    timestamp: number;
    type: 'tool_call' | 'tool_output' | 'approval_request' | 'approval_decision';
    data: unknown;
  }>;
};

export type ExportSessionPayload = {
  sessionId: string;
  format: 'markdown' | 'json';
};

export type ExportSessionResponse = {
  path: string;
};

export type ExportAuditPayload = {
  sessionId: string;
  format: 'jsonl' | 'json';
};

export type ExportAuditResponse = {
  path: string;
};
