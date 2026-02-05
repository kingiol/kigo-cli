import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type ConfigGetResponse,
  type ConfigSavePayload,
  type ConfigPathResponse,
  type ConfigInitResponse,
  type ConfigSetPayload,
  type ConfigSetResponse,
  type MCPAddPayload,
  type MCPAddResponse,
  type MCPListResponse,
  type MCPRemovePayload,
  type MCPRemoveResponse,
  type MCPTestPayload,
  type MCPTestResponse,
  type AuthLoginPayload,
  type AuthLoginResponse,
  type AuthListResponse,
  type AuthStatusPayload,
  type AuthStatusResponse,
  type AuthRevokePayload,
  type AuthRevokeResponse,
  type SkillsListResponse,
  type SkillsGetPayload,
  type SkillsGetResponse,
  type SkillsRefreshResponse,
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
    path: (): Promise<ConfigPathResponse> => ipcRenderer.invoke(IPC_CHANNELS.configPath),
    init: (): Promise<ConfigInitResponse> => ipcRenderer.invoke(IPC_CHANNELS.configInit),
    set: (payload: ConfigSetPayload): Promise<ConfigSetResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.configSet, payload)
  },
  mcp: {
    list: (): Promise<MCPListResponse> => ipcRenderer.invoke(IPC_CHANNELS.mcpList),
    add: (payload: MCPAddPayload): Promise<MCPAddResponse> => ipcRenderer.invoke(IPC_CHANNELS.mcpAdd, payload),
    remove: (payload: MCPRemovePayload): Promise<MCPRemoveResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.mcpRemove, payload),
    test: (payload: MCPTestPayload): Promise<MCPTestResponse> => ipcRenderer.invoke(IPC_CHANNELS.mcpTest, payload)
  },
  auth: {
    login: (payload: AuthLoginPayload): Promise<AuthLoginResponse> => ipcRenderer.invoke(IPC_CHANNELS.authLogin, payload),
    list: (): Promise<AuthListResponse> => ipcRenderer.invoke(IPC_CHANNELS.authList),
    status: (payload: AuthStatusPayload): Promise<AuthStatusResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.authStatus, payload),
    revoke: (payload: AuthRevokePayload): Promise<AuthRevokeResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.authRevoke, payload)
  },
  skills: {
    list: (): Promise<SkillsListResponse> => ipcRenderer.invoke(IPC_CHANNELS.skillsList),
    get: (payload: SkillsGetPayload): Promise<SkillsGetResponse> =>
      ipcRenderer.invoke(IPC_CHANNELS.skillsGet, payload),
    refresh: (): Promise<SkillsRefreshResponse> => ipcRenderer.invoke(IPC_CHANNELS.skillsRefresh)
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
  },
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.appQuit)
  }
});
