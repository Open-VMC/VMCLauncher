import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import type {
  AuthPayload,
  CreateServerPayload,
  LauncherEvent,
  LauncherSnapshot,
  PluginInstallRequest,
  PluginSearchRequest,
  ServerDetails,
  UpdateServerSettingsPayload,
  UpdateServerDisplayNamePayload,
  UpdateVmcSettingsPayload,
} from "../shared/contracts";
import { SERVER_CATALOG } from "../shared/contracts";
import { OpenVmcApiError, OpenVmcAuthClient } from "./services/auth-client";
import { JavaRuntimeManager } from "./services/java-runtime";
import { ServerManager } from "./services/server-manager";
import { createLauncherPaths, LauncherStateStore } from "./services/storage";

const isDev = process.env.NODE_ENV === "development";
const RENDERER_URL = process.env.VMC_RENDERER_URL;

let mainWindow: BrowserWindow | null = null;
const serverWindows = new Map<string, BrowserWindow>();

let stateStore: LauncherStateStore;
let authClient: OpenVmcAuthClient;
let serverManager: ServerManager;
let servicesReady: Promise<void> | null = null;

function ensureServicesReady(): Promise<void> {
  if (!servicesReady) {
    servicesReady = initializeServices();
  }
  return servicesReady;
}

async function initializeServices(): Promise<void> {
  const paths = await createLauncherPaths(app.getPath("userData"));
  stateStore = new LauncherStateStore(paths);
  await stateStore.load();

  authClient = new OpenVmcAuthClient();
  const javaManager = new JavaRuntimeManager(paths.runtimesDir, paths.cacheDir);
  serverManager = new ServerManager(
    stateStore,
    authClient,
    javaManager,
    paths.cacheDir,
    broadcastEvent,
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev && RENDERER_URL) {
    mainWindow.loadURL(RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("launcher:getSnapshot", async (): Promise<LauncherSnapshot> => {
  await ensureServicesReady();
  await refreshRemoteAccountIfNeeded();
  return stateStore.getSnapshot(serverManager.getActiveServerId(), SERVER_CATALOG);
});

ipcMain.handle("launcher:getServerDetails", async (_, serverUuid: string): Promise<ServerDetails> => {
  await ensureServicesReady();
  return serverManager.getServerDetails(serverUuid);
});

ipcMain.handle("launcher:register", async (_, payload: AuthPayload) => {
  await ensureServicesReady();
  const session = await authClient.register(payload, stateStore.getDeviceId());
  await stateStore.setAuthSession(session.token, session.account);
  return session.account;
});

ipcMain.handle("launcher:login", async (_, payload: AuthPayload) => {
  await ensureServicesReady();
  const session = await authClient.login(payload, stateStore.getDeviceId());
  await stateStore.setAuthSession(session.token, session.account);
  return session.account;
});

ipcMain.handle("launcher:logout", async () => {
  await ensureServicesReady();
  const token = stateStore.getAuthToken();
  try {
    if (token) {
      await authClient.logout(token, stateStore.getDeviceId());
    }
  } finally {
    await stateStore.clearAuthSession();
  }
});

ipcMain.handle("launcher:createServer", async (_, payload: CreateServerPayload) => {
  await ensureServicesReady();
  await refreshRemoteAccountIfNeeded();
  const server = await serverManager.createServer(payload);
  broadcastEvent({ type: "server-updated", serverUuid: server.serverUuid });
  return server;
});

ipcMain.handle("launcher:openServerWindow", async (_, serverUuid: string) => {
  await ensureServicesReady();

  if (serverWindows.has(serverUuid)) {
    serverWindows.get(serverUuid)?.focus();
    return;
  }

  const serverWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const serverUrl = isDev && RENDERER_URL
    ? `${RENDERER_URL}#/server/${serverUuid}/console`
    : `file://${path.join(__dirname, "../renderer/index.html")}#/server/${serverUuid}/console`;

  serverWindow.loadURL(serverUrl);
  if (isDev) {
    serverWindow.webContents.openDevTools();
  }

  serverWindows.set(serverUuid, serverWindow);
  serverWindow.on("closed", () => {
    serverWindows.delete(serverUuid);
  });
});

ipcMain.handle("launcher:startServer", async (_, serverUuid: string) => {
  await ensureServicesReady();
  await serverManager.startServer(serverUuid);
});

ipcMain.handle("launcher:stopServer", async (_, serverUuid: string) => {
  await ensureServicesReady();
  await serverManager.stopServer(serverUuid);
});

ipcMain.handle("launcher:sendConsoleCommand", async (_, serverUuid: string, command: string) => {
  await ensureServicesReady();
  await serverManager.sendConsoleCommand(serverUuid, command);
});

ipcMain.handle("launcher:readServerFile", async (_, serverUuid: string, relativePath: string) => {
  await ensureServicesReady();
  return serverManager.readServerFile(serverUuid, relativePath);
});

ipcMain.handle("launcher:writeServerFile", async (_, serverUuid: string, relativePath: string, content: string) => {
  await ensureServicesReady();
  return serverManager.writeServerFile(serverUuid, relativePath, content);
});

ipcMain.handle("launcher:deleteServerFiles", async (_, serverUuid: string, relativePaths: string[]) => {
  await ensureServicesReady();
  return serverManager.deleteServerFiles(serverUuid, relativePaths);
});

ipcMain.handle("launcher:copyServerFiles", async (_, serverUuid: string, relativePaths: string[], destRelativePath: string) => {
  await ensureServicesReady();
  return serverManager.copyServerFiles(serverUuid, relativePaths, destRelativePath);
});

ipcMain.handle("launcher:moveServerFiles", async (_, serverUuid: string, relativePaths: string[], destRelativePath: string) => {
  await ensureServicesReady();
  return serverManager.moveServerFiles(serverUuid, relativePaths, destRelativePath);
});

ipcMain.handle("launcher:createServerDirectory", async (_, serverUuid: string, relativePath: string) => {
  await ensureServicesReady();
  return serverManager.createServerDirectory(serverUuid, relativePath);
});

ipcMain.handle("launcher:uploadServerFiles", async (event, serverUuid: string, destRelativePath: string) => {
  await ensureServicesReady();
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) throw new Error("Window not found");
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return serverManager.uploadServerFiles(serverUuid, result.filePaths, destRelativePath);
  }
});

ipcMain.handle("launcher:searchPlugins", async (_, payload: PluginSearchRequest) => {
  await ensureServicesReady();
  return serverManager.searchPlugins(payload.serverUuid, payload.provider, payload.query);
});

ipcMain.handle("launcher:installPlugin", async (_, payload: PluginInstallRequest) => {
  await ensureServicesReady();
  return serverManager.installPlugin(payload);
});

ipcMain.handle("launcher:updateServerSettings", async (_, payload: UpdateServerSettingsPayload) => {
  await ensureServicesReady();
  return serverManager.updateServerSettings(payload);
});

ipcMain.handle("launcher:updateServerDisplayName", async (_, payload: any) => {
  await ensureServicesReady();
  return serverManager.updateServerDisplayName(payload);
});

ipcMain.handle("launcher:deleteServer", async (_, serverUuid: string) => {
  await ensureServicesReady();
  return serverManager.deleteServer(serverUuid);
});

ipcMain.handle("launcher:updateVmcSettings", async (_, payload: UpdateVmcSettingsPayload) => {
  await ensureServicesReady();
  return serverManager.updateVmcSettings(payload);
});

function broadcastEvent(event: LauncherEvent) {
  if (mainWindow) {
    mainWindow.webContents.send("launcher:event", event);
  }
  for (const serverWindow of serverWindows.values()) {
    serverWindow.webContents.send("launcher:event", event);
  }
}

async function refreshRemoteAccountIfNeeded(): Promise<void> {
  const token = stateStore.getAuthToken();
  if (!token) {
    return;
  }

  try {
    const account = await authClient.getMe(token, stateStore.getDeviceId());
    await stateStore.updateAccount(account);
  } catch (error) {
    if (error instanceof OpenVmcApiError && (error.status === 401 || error.status === 403)) {
      await stateStore.clearAuthSession();
      return;
    }
    throw error;
  }
}

app.whenReady().then(async () => {
  await ensureServicesReady();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  await ensureServicesReady();
  if (mainWindow === null) {
    createWindow();
  }
});
