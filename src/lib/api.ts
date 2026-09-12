import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  LauncherSnapshot,
  LauncherSettings,
  ServerDetails,
  ServerLiveStats,
  ServerRecord,
  CreateServerPayload,
  UpdateServerSettingsPayload,
  PluginSearchRequest,
  PluginSearchResult,
  BrowsePluginsRequest,
  PluginInstallRequest,
  PluginInstallResult,
  PluginVersionEntry,
  InstallPluginVersionRequest,
  ResolvedPluginInfo,
  PumpkinMarketPlugin,
  ServerFileContent,
  FileEntry,
  LauncherEvent,
} from "../types";

// Event bus
// Singleton : un seul listener Tauri, dispatch synchrone vers les callbacks.
// Évite les race conditions de listen() async et les doublons de listeners.
type EventCallback = (event: LauncherEvent) => void;
const eventCallbacks = new Set<EventCallback>();
listen<LauncherEvent>("launcher:event", (e) => {
  eventCallbacks.forEach((cb) => cb(e.payload));
});

export const api = {
  // Server
  getSnapshot: () => invoke<LauncherSnapshot>("get_snapshot"),

  getServerDetails: (serverUuid: string) =>
    invoke<ServerDetails>("get_server_details", { serverUuid }),

  getCachedServerDetails: (serverUuid: string) =>
    invoke<ServerDetails | null>("get_cached_server_details", { serverUuid }),

  getServerStats: (serverUuid: string) =>
    invoke<ServerLiveStats>("get_server_stats", { serverUuid }),


  // Files
  listServerFiles: (serverUuid: string, relativePath: string) =>
    invoke<FileEntry[]>("list_server_files", { serverUuid, relativePath }),

  createServer: (payload: CreateServerPayload) =>
    invoke<ServerRecord>("create_server", { payload }),

  deleteServer: (serverUuid: string) =>
    invoke<void>("delete_server", { serverUuid }),

  renameServer: (serverUuid: string, newName: string) =>
    invoke<ServerRecord>("rename_server", { serverUuid, newName }),

  openServerWindow: (serverUuid: string) =>
    invoke<void>("open_server_window", { serverUuid }),

  startServer: (serverUuid: string) =>
    invoke<void>("start_server", { serverUuid }),

  stopServer: (serverUuid: string) =>
    invoke<void>("stop_server", { serverUuid }),

  sendConsoleCommand: (serverUuid: string, command: string) =>
    invoke<void>("send_console_command", { serverUuid, command }),

  readServerFile: (serverUuid: string, relativePath: string) =>
    invoke<ServerFileContent>("read_server_file", { serverUuid, relativePath }),

  writeServerFile: (serverUuid: string, relativePath: string, content: string) =>
    invoke<FileEntry>("write_server_file", { serverUuid, relativePath, content }),

  deleteServerFiles: (serverUuid: string, relativePaths: string[]) =>
    invoke<void>("delete_server_files", { serverUuid, relativePaths }),

  copyServerFiles: (serverUuid: string, relativePaths: string[], destRelativePath: string) =>
    invoke<void>("copy_server_files", { serverUuid, relativePaths, destRelativePath }),

  moveServerFiles: (serverUuid: string, relativePaths: string[], destRelativePath: string) =>
    invoke<void>("move_server_files", { serverUuid, relativePaths, destRelativePath }),

  createServerDirectory: (serverUuid: string, relativePath: string) =>
    invoke<void>("create_server_directory", { serverUuid, relativePath }),

  uploadServerFiles: (serverUuid: string, destRelativePath: string, filePaths?: string[], filterExtensions?: string[]) =>
    invoke<void>("upload_server_files", { serverUuid, destRelativePath, filePaths, filterExtensions }),


  // Plugins
  searchPlugins: (payload: PluginSearchRequest) =>
    invoke<PluginSearchResult[]>("search_plugins", { payload }),

  browsePlugins: (payload: BrowsePluginsRequest) =>
    invoke<PluginSearchResult[]>("browse_plugins", { payload }),

  installPlugin: (payload: PluginInstallRequest) =>
    invoke<PluginInstallResult>("install_plugin", { payload }),

  searchPumpkinMarket: (sort: string) =>
    invoke<PumpkinMarketPlugin[]>("search_pumpkin_market", { sort }),

  installPatchbukkit: (serverUuid: string) =>
    invoke<void>("install_patchbukkit", { serverUuid }),

  checkPatchbukkitInstalled: (serverUuid: string) =>
    invoke<boolean>("check_patchbukkit_installed", { serverUuid }),

  resolvePluginInfo: (pluginName: string) =>
    invoke<ResolvedPluginInfo | null>("resolve_plugin_info", { pluginName }),

  listPluginVersions: (serverUuid: string, provider: string, projectId: string, slug: string, author: string) =>
    invoke<PluginVersionEntry[]>("list_plugin_versions", { serverUuid, provider, projectId, slug, author }),

  installPluginVersion: (payload: InstallPluginVersionRequest) =>
    invoke<string>("install_plugin_version", { payload }),

  togglePlugin: (serverUuid: string, fileName: string, enabled: boolean) =>
    invoke<string>("toggle_plugin", { serverUuid, fileName, enabled }),

  uploadPluginFiles: (serverUuid: string, filePaths: string[]) =>
    invoke<number>("upload_plugin_files", { serverUuid, filePaths }),


  // Settings
  updateServerSetting: (serverUuid: string, field: string, value: unknown) =>
    invoke<void>("update_server_setting", { serverUuid, field, value }),

  switchServerVersion: (serverUuid: string, tag: string) =>
    invoke<void>("switch_server_version", { serverUuid, tag }),

  updateServerSettings: (payload: UpdateServerSettingsPayload) =>
    invoke<ServerRecord>("update_server_settings", { payload }),


  // Events
  getLauncherSettings: () =>
    invoke<LauncherSettings>("get_launcher_settings"),

  updateLauncherSetting: (field: string, value: unknown) =>
    invoke<void>("update_launcher_setting", { field, value }),

  getDataDir: () =>
    invoke<string>("get_data_dir"),

  openDataDir: () =>
    invoke<void>("open_data_dir"),

  onEvent: (listener: (event: LauncherEvent) => void): (() => void) => {
    eventCallbacks.add(listener);
    return () => eventCallbacks.delete(listener);
  },
};
