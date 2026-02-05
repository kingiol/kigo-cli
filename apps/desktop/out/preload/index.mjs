import { contextBridge, ipcRenderer } from "electron";
const IPC_CHANNELS = {
  configGet: "config:get",
  configSave: "config:save",
  configPath: "config:path",
  configInit: "config:init",
  configSet: "config:set",
  mcpList: "mcp:list",
  mcpAdd: "mcp:add",
  mcpRemove: "mcp:remove",
  mcpTest: "mcp:test",
  authLogin: "auth:login",
  authList: "auth:list",
  authStatus: "auth:status",
  authRevoke: "auth:revoke",
  skillsList: "skills:list",
  skillsGet: "skills:get",
  skillsRefresh: "skills:refresh",
  chatStart: "chat:start",
  chatEvent: "chat:event",
  chatApproval: "chat:approval",
  chatApprove: "chat:approve",
  sessionList: "session:list",
  sessionLoad: "session:load",
  sessionRename: "session:rename",
  sessionDelete: "session:delete",
  auditLoad: "audit:load",
  exportSession: "export:session",
  exportAudit: "export:audit",
  appQuit: "app:quit"
};
contextBridge.exposeInMainWorld("kigo", {
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.configGet),
    save: (payload) => ipcRenderer.invoke(IPC_CHANNELS.configSave, payload),
    path: () => ipcRenderer.invoke(IPC_CHANNELS.configPath),
    init: () => ipcRenderer.invoke(IPC_CHANNELS.configInit),
    set: (payload) => ipcRenderer.invoke(IPC_CHANNELS.configSet, payload)
  },
  mcp: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.mcpList),
    add: (payload) => ipcRenderer.invoke(IPC_CHANNELS.mcpAdd, payload),
    remove: (payload) => ipcRenderer.invoke(IPC_CHANNELS.mcpRemove, payload),
    test: (payload) => ipcRenderer.invoke(IPC_CHANNELS.mcpTest, payload)
  },
  auth: {
    login: (payload) => ipcRenderer.invoke(IPC_CHANNELS.authLogin, payload),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.authList),
    status: (payload) => ipcRenderer.invoke(IPC_CHANNELS.authStatus, payload),
    revoke: (payload) => ipcRenderer.invoke(IPC_CHANNELS.authRevoke, payload)
  },
  skills: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.skillsList),
    get: (payload) => ipcRenderer.invoke(IPC_CHANNELS.skillsGet, payload),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.skillsRefresh)
  },
  chat: {
    start: (payload) => ipcRenderer.invoke(IPC_CHANNELS.chatStart, payload),
    approve: (payload) => ipcRenderer.invoke(IPC_CHANNELS.chatApprove, payload),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on(IPC_CHANNELS.chatEvent, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.chatEvent, listener);
    },
    onApproval: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on(IPC_CHANNELS.chatApproval, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.chatApproval, listener);
    }
  },
  session: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.sessionList),
    load: (payload) => ipcRenderer.invoke(IPC_CHANNELS.sessionLoad, payload),
    rename: (payload) => ipcRenderer.invoke(IPC_CHANNELS.sessionRename, payload),
    remove: (payload) => ipcRenderer.invoke(IPC_CHANNELS.sessionDelete, payload)
  },
  audit: {
    load: (payload) => ipcRenderer.invoke(IPC_CHANNELS.auditLoad, payload)
  },
  export: {
    session: (payload) => ipcRenderer.invoke(IPC_CHANNELS.exportSession, payload),
    audit: (payload) => ipcRenderer.invoke(IPC_CHANNELS.exportAudit, payload)
  },
  app: {
    quit: () => ipcRenderer.invoke(IPC_CHANNELS.appQuit)
  }
});
