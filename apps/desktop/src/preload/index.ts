import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type ConfigGetResponse,
  type ConfigSavePayload,
  type ConfigPathResponse,
  type MCPAddPayload,
  type MCPAddResponse,
  type MCPListResponse,
  type MCPRemovePayload,
  type MCPRemoveResponse,
  type MCPTestPayload,
  type MCPTestResponse,
  type ChatStartPayload,
  type ChatStartResponse,
  type ChatEventPayload,
  type ChatApprovalPayload,
  type ChatApprovePayload,
  type SessionListResponse,
  type SessionLoadPayload,
  type SessionLoadResponse,
  type SessionRenamePayload,
  type SessionDeletePayload,
  type AuditLoadPayload,
  type AuditLoadResponse,
  type ExportSessionPayload,
  type ExportSessionResponse,
  type ExportAuditPayload,
  type ExportAuditResponse
} from '../shared/ipc.js';

contextBridge.exposeInMainWorld('kigo', {
  config: {
    get: (): Promise<ConfigGetResponse> => ipcRenderer.invoke(IPC_CHANNELS.configGet),
    save: (payload: ConfigSavePayload): Promise<{ path: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.configSave, payload),
    path: (): Promise<ConfigPathResponse> => ipcRenderer.invoke(IPC_CHANNELS.configPath)
  },
  mcp: {
    list: (): Promise<MCPListResponse> => ipcRenderer.invoke(IPC_CHANNELS.mcpList),
    add: (payload: MCPAddPayload): Promise<MCPAddResponse> => ipcRenderer.invoke(IPC_CHANNELS.mcpAdd, payload),
    remove: (payload: MCPRemovePayload): Promise<MCPRemoveResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.mcpRemove, payload),
    test: (payload: MCPTestPayload): Promise<MCPTestResponse> => ipcRenderer.invoke(IPC_CHANNELS.mcpTest, payload)
  },
  chat: {
    start: (payload: ChatStartPayload): Promise<ChatStartResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.chatStart, payload),
    approve: (payload: ChatApprovePayload): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.chatApprove, payload),
    onEvent: (handler: (payload: ChatEventPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ChatEventPayload) => handler(payload);
      ipcRenderer.on(IPC_CHANNELS.chatEvent, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.chatEvent, listener);
    },
    onApproval: (handler: (payload: ChatApprovalPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ChatApprovalPayload) => handler(payload);
      ipcRenderer.on(IPC_CHANNELS.chatApproval, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.chatApproval, listener);
    }
  },
  session: {
    list: (): Promise<SessionListResponse> => ipcRenderer.invoke(IPC_CHANNELS.sessionList),
    load: (payload: SessionLoadPayload): Promise<SessionLoadResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionLoad, payload),
    rename: (payload: SessionRenamePayload): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionRename, payload),
    remove: (payload: SessionDeletePayload): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.sessionDelete, payload)
  },
  audit: {
    load: (payload: AuditLoadPayload): Promise<AuditLoadResponse> => ipcRenderer.invoke(IPC_CHANNELS.auditLoad, payload)
  },
  export: {
    session: (payload: ExportSessionPayload): Promise<ExportSessionResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.exportSession, payload),
    audit: (payload: ExportAuditPayload): Promise<ExportAuditResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.exportAudit, payload)
  }
});
