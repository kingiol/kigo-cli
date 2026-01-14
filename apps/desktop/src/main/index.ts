import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { addOrUpdateMcpServer, listMcpServers, removeMcpServer, testMcpServer } from './mcp.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { ChatService } from './chat.js';
import { listSessions, loadSessionMessages, updateSessionTitle, deleteSession } from './sessionStore.js';
import { loadAudit } from './auditStore.js';
import { exportSession, exportAudit } from './exportStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
let mainWindow: BrowserWindow | null = null;
const chatService = new ChatService(() => mainWindow?.webContents ?? null);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow = win;
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle(IPC_CHANNELS.configGet, async () => loadConfig());
  ipcMain.handle(IPC_CHANNELS.configSave, async (_event, payload) => {
    const path = await saveConfig(payload.config);
    return { path };
  });
  ipcMain.handle(IPC_CHANNELS.configPath, async () => ({ path: getConfigPath() }));
  ipcMain.handle(IPC_CHANNELS.mcpList, async () => ({ servers: await listMcpServers() }));
  ipcMain.handle(IPC_CHANNELS.mcpAdd, async (_event, payload) => addOrUpdateMcpServer(payload.server));
  ipcMain.handle(IPC_CHANNELS.mcpRemove, async (_event, payload) => removeMcpServer(payload.name));
  ipcMain.handle(IPC_CHANNELS.mcpTest, async (_event, payload) => testMcpServer(payload.server));
  ipcMain.handle(IPC_CHANNELS.chatStart, async (_event, payload) => {
    const { config } = await loadConfig();
    const sessionId = await chatService.start(payload.input, config, payload.sessionId);
    return { sessionId };
  });
  ipcMain.handle(IPC_CHANNELS.chatApprove, async (_event, payload) => {
    chatService.approve(payload.sessionId, payload.requestId, payload.approved);
  });
  ipcMain.handle(IPC_CHANNELS.sessionList, async () => ({ sessions: await listSessions() }));
  ipcMain.handle(IPC_CHANNELS.sessionLoad, async (_event, payload) => ({
    messages: await loadSessionMessages(payload.sessionId)
  }));
  ipcMain.handle(IPC_CHANNELS.sessionRename, async (_event, payload) => {
    await updateSessionTitle(payload.sessionId, payload.title ?? null);
    return { ok: true };
  });
  ipcMain.handle(IPC_CHANNELS.sessionDelete, async (_event, payload) => {
    await deleteSession(payload.sessionId);
    return { ok: true };
  });
  ipcMain.handle(IPC_CHANNELS.auditLoad, async (_event, payload) => ({
    records: await loadAudit(payload.sessionId)
  }));
  ipcMain.handle(IPC_CHANNELS.exportSession, async (_event, payload) => ({
    path: await exportSession(payload.sessionId, payload.format)
  }));
  ipcMain.handle(IPC_CHANNELS.exportAudit, async (_event, payload) => ({
    path: await exportAudit(payload.sessionId, payload.format)
  }));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
