import { contextBridge, ipcRenderer } from "electron";
const IPC_CHANNELS = {
  configGet: "config:get",
  configSave: "config:save",
  configPath: "config:path",
  mcpList: "mcp:list",
  mcpAdd: "mcp:add",
  mcpRemove: "mcp:remove",
  mcpTest: "mcp:test",
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
  exportAudit: "export:audit"
};
contextBridge.exposeInMainWorld("kigo", {
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.configGet),
    save: (payload) => ipcRenderer.invoke(IPC_CHANNELS.configSave, payload),
    path: () => ipcRenderer.invoke(IPC_CHANNELS.configPath)
  },
  mcp: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.mcpList),
    add: (payload) => ipcRenderer.invoke(IPC_CHANNELS.mcpAdd, payload),
    remove: (payload) => ipcRenderer.invoke(IPC_CHANNELS.mcpRemove, payload),
    test: (payload) => ipcRenderer.invoke(IPC_CHANNELS.mcpTest, payload)
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
  }
});
