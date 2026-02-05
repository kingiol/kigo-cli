import './shims/web-file.js';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, getConfigPath } from './config.js';
import { DEFAULT_CONFIG } from '@kigo/config';
import { addOrUpdateMcpServer, listMcpServers, removeMcpServer, testMcpServer } from './mcp.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { ChatService } from './chat.js';
import { listSessions, loadSessionMessages, updateSessionTitle, deleteSession } from './sessionStore.js';
import { loadAudit } from './auditStore.js';
import { exportSession, exportAudit } from './exportStore.js';
import { login as authLogin, listProviders as authList, getStatus as authStatus, revoke as authRevoke } from './auth.js';
import { listSkills, getSkill } from './skills.js';

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
  ipcMain.handle(IPC_CHANNELS.configInit, async () => {
    const path = await saveConfig(DEFAULT_CONFIG);
    return { path, config: DEFAULT_CONFIG };
  });
  ipcMain.handle(IPC_CHANNELS.configSet, async (_event, payload) => {
    const { config } = await loadConfig();
    const keys = payload.key.split('.');
    let current: any = config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = payload.value;
    const path = await saveConfig(config);
    return { path, config };
  });
  ipcMain.handle(IPC_CHANNELS.mcpList, async () => ({ servers: await listMcpServers() }));
  ipcMain.handle(IPC_CHANNELS.mcpAdd, async (_event, payload) => addOrUpdateMcpServer(payload.server));
  ipcMain.handle(IPC_CHANNELS.mcpRemove, async (_event, payload) => removeMcpServer(payload.name));
  ipcMain.handle(IPC_CHANNELS.mcpTest, async (_event, payload) => testMcpServer(payload.server));
  ipcMain.handle(IPC_CHANNELS.authLogin, async (_event, payload) => authLogin(payload.provider));
  ipcMain.handle(IPC_CHANNELS.authList, async () => ({ providers: await authList() }));
  ipcMain.handle(IPC_CHANNELS.authStatus, async (_event, payload) => authStatus(payload.provider));
  ipcMain.handle(IPC_CHANNELS.authRevoke, async (_event, payload) => authRevoke(payload.provider));
  ipcMain.handle(IPC_CHANNELS.skillsList, async () => ({ skills: await listSkills() }));
  ipcMain.handle(IPC_CHANNELS.skillsGet, async (_event, payload) => {
    const skill = await getSkill(payload.name);
    if (!skill) {
      throw new Error(`Skill not found: ${payload.name}`);
    }
    return skill;
  });
  ipcMain.handle(IPC_CHANNELS.skillsRefresh, async () => ({ skills: await listSkills() }));
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
  ipcMain.handle(IPC_CHANNELS.appQuit, async () => {
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
