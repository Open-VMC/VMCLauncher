// Primitives

export type ServerKind = "vanilla" | "papermc" | "fabric" | "forge" | "neoforge" | "pumpkin";
export type ServerStatus = "stopped" | "starting" | "running" | "stopping" | "error";
export type NetworkMode = "public" | "code" | "whitelist";
export type NetworkState = "disabled" | "disconnected" | "connecting" | "connected" | "error";
export type ConsoleLevel = "info" | "warn" | "error" | "command";
export type LauncherRoute = "home" | "servers" | "settings";
export type ServerRoute = "console" | "files" | "plugins" | "settings";
export type PluginProvider = "modrinth" | "hangar";

// Settings

export interface ServerSettings {
  difficulty: "peaceful" | "easy" | "normal" | "hard";
  gamemode: "survival" | "creative" | "adventure";
  maxPlayers: number;
  maxTickTime: number;
  maxWorldSize: number;
  pvp: boolean;
  spawnProtection: number;
  rateLimit: number;
  viewDistance: number;
  simulationDistance: number;
  motd: string;
  levelSeed: string;
  hardcore: boolean;
  allowFlight: boolean;
  whiteList: boolean;
  playerIdleTimeout: number;
  forceGamemode: boolean;
}

export interface VmcSettings {
  enabled: boolean;
  slug: string;
  mode: NetworkMode;
  whitelist: string[];
  lastAccessCode: string | null;
  lastAccessCodeIssuedAt: string | null;
  state: NetworkState;
}

// Server record

export interface ServerRecord {
  serverUuid: string;
  displayName: string;
  slug: string;
  kind: ServerKind;
  version: string;
  memoryMb: number;
  cpuCores: number;
  javaVersion: number;
  status: ServerStatus;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
  rootDir: string;
  settings: ServerSettings;
  vmc: VmcSettings;
  autoUpdate: boolean;
}

// Console

export interface ConsoleLine {
  id: string;
  timestamp: string;
  level: ConsoleLevel;
  text: string;
}

// Files

export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number;
  modifiedAt: string;
}

export interface ServerFileContent {
  path: string;
  content: string;
  modifiedAt: string;
}

// Stats

export interface ServerStats {
  uptimeSeconds: number;
  cpuPercent: number;
  cpuLimitPercent: number;
  ramUsedMb: number;
  ramLimitMb: number;
  storageMb: number;
}

// Plugins

export interface InstalledPlugin {
  id: string;
  fileName: string;
  displayName: string;
  path: string;
  enabled: boolean;
  size: number;
  modifiedAt: string;
  pluginName?: string;
  pluginVersion?: string;
  description?: string;
  authors?: string[];
  website?: string;
  iconUrl?: string;
  projectUrl?: string;
  provider?: PluginProvider;
}

export interface ResolvedPluginInfo {
  provider: PluginProvider;
  iconUrl: string | null;
  projectUrl: string | null;
  description: string | null;
  latestVersion: string | null;
  latestFileName: string | null;
}

export interface PluginSearchResult {
  provider: PluginProvider;
  projectId: string;
  slug: string;
  author: string;
  title: string;
  summary: string;
  iconUrl: string | null;
  downloads: number;
  categories: string[];
  updatedAt: string | null;
  latestVersionLabel: string | null;
  websiteUrl: string | null;
  compatibleWithServer: boolean;
}

export interface PluginSearchRequest {
  serverUuid: string;
  provider: PluginProvider;
  query: string;
}

export interface BrowsePluginsRequest {
  serverUuid: string;
  provider: PluginProvider;
  sort: string;
}

export interface PluginInstallRequest {
  serverUuid: string;
  provider: PluginProvider;
  projectId: string;
  slug: string;
  author: string;
}

export interface PluginInstallResult {
  provider: PluginProvider;
  pluginName: string;
  fileName: string;
  targetPath: string;
}

export interface PluginVersionEntry {
  versionId: string;
  versionNumber: string;
  name: string;
  versionType: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  downloads: number;
  fileUrl: string | null;
  fileName: string | null;
  changelog: string | null;
}

export interface InstallPluginVersionRequest {
  serverUuid: string;
  provider: PluginProvider;
  projectId: string;
  slug: string;
  author: string;
  versionId: string;
  fileUrl: string;
  fileName: string;
  oldFileName: string;
}

// Catalog

export interface ServerCatalogVersionEntry {
  version: string;
  downloadUrl: string;
  javaVersion: number;
  vmc: {
    compatible: boolean;
    patchUrl: string | null;
  };
}

export interface ServerCatalogEntry {
  kind: ServerKind;
  label: string;
  subtitle: string;
  versions: ServerCatalogVersionEntry[];
}

// Launcher Settings

export interface LauncherSettings {
  closeToTray: boolean;
  stopServersOnQuit: boolean;
  notificationsEnabled: boolean;
  autostart: boolean;
  showTrayIcon: boolean;
}

// Composites

export interface LauncherSnapshot {
  activeServerId: string | null;
  servers: ServerRecord[];
  catalog: ServerCatalogEntry[];
}

export interface ServerLiveStats {
  status: ServerStatus;
  stats: ServerStats;
}

export interface ServerDetails {
  server: ServerRecord;
  stats: ServerStats;
  consoleLines: ConsoleLine[];
  plugins: InstalledPlugin[];
  paperPort: number;
  localIp: string;
}

export interface PumpkinMarketPlugin {
  id: number;
  name: string;
  type: string;
  priceCents: number;
  price: number;
  saleActive: boolean;
  saleDiscountPercent: number;
  downloads: number;
  category: string;
  previewPath: string | null;
  translatedDescriptions: Record<string, string>;
  devName: string;
  screenshots: string[];
  isEarlyAccess: boolean;
  isPreorder: boolean;
  preorderReleaseDate: string | null;
  version: string;
  status: string;
}

// Payloads

export interface CreateServerPayload {
  displayName: string;
  kind: ServerKind;
  version: string;
  memoryMb: number;
  cpuCores: number;
}

export interface UpdateServerSettingsPayload {
  serverUuid: string;
  settings: ServerSettings;
}

export interface InstallationProgress {
  serverUuid: string | null;
  stage: string;
  detail: string;
  currentStep: number;
  totalSteps: number;
  percent: number;
  done: boolean;
}

// Events

export interface LauncherEvent {
  type: "state-changed" | "server-updated" | "installation-progress" | "console-line" | "java-upgraded";
  serverUuid?: string;
  progress?: InstallationProgress;
  consoleLine?: ConsoleLine;
}
