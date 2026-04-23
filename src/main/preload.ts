import { contextBridge, ipcRenderer, webUtils } from "electron";

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  versions: process.versions,
  platform: process.platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});

// Expose vmcLauncher API
contextBridge.exposeInMainWorld("vmcLauncher", {
  getSnapshot: () => ipcRenderer.invoke("launcher:getSnapshot"),
  getServerDetails: (id: string) => ipcRenderer.invoke("launcher:getServerDetails", id),
  register: (payload: any) => ipcRenderer.invoke("launcher:register", payload),
  login: (payload: any) => ipcRenderer.invoke("launcher:login", payload),
  logout: () => ipcRenderer.invoke("launcher:logout"),
  createServer: (payload: any) => ipcRenderer.invoke("launcher:createServer", payload),
  deleteServer: (id: string) => ipcRenderer.invoke("launcher:deleteServer", id),
  renameServer: (id: string, name: string) => ipcRenderer.invoke("launcher:renameServer", id, name),
  openServerWindow: (id: string) => ipcRenderer.invoke("launcher:openServerWindow", id),
  startServer: (id: string) => ipcRenderer.invoke("launcher:startServer", id),
  stopServer: (id: string) => ipcRenderer.invoke("launcher:stopServer", id),
  sendConsoleCommand: (id: string, cmd: string) => ipcRenderer.invoke("launcher:sendConsoleCommand", id, cmd),
  readServerFile: (id: string, relativePath: string) => ipcRenderer.invoke("launcher:readServerFile", id, relativePath),
  writeServerFile: (id: string, relativePath: string, content: string) => ipcRenderer.invoke("launcher:writeServerFile", id, relativePath, content),
  deleteServerFiles: (id: string, relativePaths: string[]) => ipcRenderer.invoke("launcher:deleteServerFiles", id, relativePaths),
  copyServerFiles: (id: string, relativePaths: string[], destRelativePath: string) => ipcRenderer.invoke("launcher:copyServerFiles", id, relativePaths, destRelativePath),
  moveServerFiles: (id: string, relativePaths: string[], destRelativePath: string) => ipcRenderer.invoke("launcher:moveServerFiles", id, relativePaths, destRelativePath),
  createServerDirectory: (id: string, relativePath: string) => ipcRenderer.invoke("launcher:createServerDirectory", id, relativePath),
  uploadServerFiles: (id: string, destRelativePath: string, filePaths?: string[]) => ipcRenderer.invoke("launcher:uploadServerFiles", id, destRelativePath, filePaths),
  searchPlugins: (payload: any) => ipcRenderer.invoke("launcher:searchPlugins", payload),
  installPlugin: (payload: any) => ipcRenderer.invoke("launcher:installPlugin", payload),
  updateServerSettings: (payload: any) => ipcRenderer.invoke("launcher:updateServerSettings", payload),
  updateVmcSettings: (payload: any) => ipcRenderer.invoke("launcher:updateVmcSettings", payload),
  log: (...args: any[]) => ipcRenderer.invoke("launcher:log", ...args),
  onEvent: (callback: () => void) => {
    ipcRenderer.on("launcher:event", callback);
    return () => ipcRenderer.removeListener("launcher:event", callback);
  },
});

contextBridge.exposeInMainWorld("ipcRenderer", {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (event: any, ...args: any[]) => void) =>
    ipcRenderer.on(channel, listener),
  once: (channel: string, listener: (event: any, ...args: any[]) => void) =>
    ipcRenderer.once(channel, listener),
  removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) =>
    ipcRenderer.removeListener(channel, listener),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
