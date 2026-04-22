export type ServerKind = "paper" | "paper-vmc";
export type ServerStatus = "stopped" | "starting" | "running" | "stopping" | "error";
export type NetworkMode = "public" | "code" | "whitelist";
export type NetworkState = "disabled" | "disconnected" | "connecting" | "connected" | "error";
export type ConsoleLevel = "info" | "warn" | "error" | "command";
export type LauncherRoute = "home" | "servers" | "settings";
export type ServerRoute = "console" | "files" | "plugins" | "settings" | "vmc";
export type PluginProvider = "modrinth" | "curseforge" | "hangar";

export interface AccountSummary {
  id: string;
  email: string;
  displayName: string;
  plan: "Free" | "Pro";
  deviceId: string;
  createdAt: string;
  serverCount: number;
  maxServers: number;
}

export interface DeviceLockSummary {
  deviceId: string;
  lockedEmail: string | null;
}

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

export interface ServerRecord {
  serverUuid: string;
  displayName: string;
  slug: string;
  kind: ServerKind;
  version: string;
  memoryMb: number;
  status: ServerStatus;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
  rootDir: string;
  settings: ServerSettings;
  vmc: VmcSettings;
}

export interface ConsoleLine {
  id: string;
  timestamp: string;
  level: ConsoleLevel;
  text: string;
}

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

export interface ServerStats {
  uptimeSeconds: number;
  cpuPercent: number;
  cpuLimitPercent: number;
  ramUsedMb: number;
  ramLimitMb: number;
  storageMb: number;
}

export interface InstalledPlugin {
  id: string;
  fileName: string;
  displayName: string;
  path: string;
  enabled: boolean;
  size: number;
  modifiedAt: string;
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

export interface ServerCatalogEntry {
  kind: ServerKind;
  label: string;
  subtitle: string;
  versions: string[];
}

export interface LauncherSnapshot {
  account: AccountSummary | null;
  deviceLock: DeviceLockSummary;
  activeServerId: string | null;
  servers: ServerRecord[];
  catalog: ServerCatalogEntry[];
}

export interface ServerDetails {
  server: ServerRecord;
  stats: ServerStats;
  consoleLines: ConsoleLine[];
  files: FileEntry[];
  plugins: InstalledPlugin[];
}

export interface AuthPayload {
  email: string;
  password: string;
  displayName?: string;
}

export interface CreateServerPayload {
  displayName: string;
  kind: ServerKind;
  version: string;
  memoryMb: number;
  vmcMode?: NetworkMode;
}

export interface UpdateServerSettingsPayload {
  serverUuid: string;
  settings: ServerSettings;
}

export interface UpdateServerDisplayNamePayload {
  serverUuid: string;
  displayName: string;
}

export interface UpdateVmcSettingsPayload {
  serverUuid: string;
  vmc: Pick<VmcSettings, "slug" | "mode" | "whitelist">;
}

export interface LauncherEvent {
  type: "state-changed" | "server-updated";
  serverUuid?: string;
}

export interface VmcLauncherApi {
  getSnapshot(): Promise<LauncherSnapshot>;
  getServerDetails(serverUuid: string): Promise<ServerDetails>;
  register(payload: AuthPayload): Promise<AccountSummary>;
  login(payload: AuthPayload): Promise<AccountSummary>;
  logout(): Promise<void>;
  createServer(payload: CreateServerPayload): Promise<ServerRecord>;
  openServerWindow(serverUuid: string): Promise<void>;
  startServer(serverUuid: string): Promise<void>;
  stopServer(serverUuid: string): Promise<void>;
  sendConsoleCommand(serverUuid: string, command: string): Promise<void>;
  readServerFile(serverUuid: string, relativePath: string): Promise<ServerFileContent>;
  writeServerFile(serverUuid: string, relativePath: string, content: string): Promise<FileEntry>;
  deleteServerFiles(serverUuid: string, relativePaths: string[]): Promise<void>;
  copyServerFiles(serverUuid: string, relativePaths: string[], destRelativePath: string): Promise<void>;
  moveServerFiles(serverUuid: string, relativePaths: string[], destRelativePath: string): Promise<void>;
  createServerDirectory(serverUuid: string, relativePath: string): Promise<void>;
  uploadServerFiles(serverUuid: string, destRelativePath: string): Promise<void>;
  searchPlugins(payload: PluginSearchRequest): Promise<PluginSearchResult[]>;
  installPlugin(payload: PluginInstallRequest): Promise<PluginInstallResult>;
  updateServerSettings(payload: UpdateServerSettingsPayload): Promise<ServerRecord>;
  updateServerDisplayName(payload: UpdateServerDisplayNamePayload): Promise<ServerRecord>;
  deleteServer(serverUuid: string): Promise<void>;
  updateVmcSettings(payload: UpdateVmcSettingsPayload): Promise<ServerRecord>;
  onEvent(listener: (event: LauncherEvent) => void): () => void;
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  difficulty: "easy",
  gamemode: "survival",
  maxPlayers: 20,
  maxTickTime: 60000,
  maxWorldSize: 29999984,
  pvp: true,
  spawnProtection: 16,
  rateLimit: 0,
  viewDistance: 10,
  simulationDistance: 10,
  motd: "An OpenVMC server",
};

export const SERVER_CATALOG: ServerCatalogEntry[] = [
  {
    kind: "paper",
    label: "Paper",
    subtitle: "Builds stables Paper officielles",
    versions: ["1.21.11", "1.21.4", "1.20.6", "1.20.1"],
  },
  {
    kind: "paper-vmc",
    label: "Paper + VMC",
    subtitle: "Paper avec connexion sortante VMC Network",
    versions: ["1.21.11", "1.21.4", "1.20.6", "1.20.1"],
  },
];
