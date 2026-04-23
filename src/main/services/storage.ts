import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AccountSummary,
  DeviceLockSummary,
  LauncherSnapshot,
  ServerRecord,
} from "../../shared/contracts";

export interface PersistedServerRecord extends ServerRecord {
  ownerAccountId: string;
  remoteServerId: string | null;
  paperPort: number;
  velocityPort: number | null;
}

interface PersistedStateFile {
  deviceId: string;
  authToken: string | null;
  account: AccountSummary | null;
  servers: PersistedServerRecord[];
}

export interface LauncherPaths {
  rootDir: string;
  stateFile: string;
  serversDir: string;
  runtimesDir: string;
  cacheDir: string;
}

const DEFAULT_STATE = (): PersistedStateFile => ({
  deviceId: randomUUID(),
  authToken: null,
  account: null,
  servers: [],
});

export async function createLauncherPaths(baseDir: string): Promise<LauncherPaths> {
  const rootDir = path.join(baseDir, "openvmc");
  const serversDir = path.join(rootDir, "servers");
  const runtimesDir = path.join(rootDir, "runtimes");
  const cacheDir = path.join(rootDir, "cache");
  await Promise.all([
    mkdir(rootDir, { recursive: true }),
    mkdir(serversDir, { recursive: true }),
    mkdir(runtimesDir, { recursive: true }),
    mkdir(cacheDir, { recursive: true }),
  ]);

  return {
    rootDir,
    stateFile: path.join(rootDir, "state.json"),
    serversDir,
    runtimesDir,
    cacheDir,
  };
}

export class LauncherStateStore {
  private state: PersistedStateFile = DEFAULT_STATE();

  constructor(private readonly paths: LauncherPaths) {}

  getPaths(): LauncherPaths {
    return this.paths;
  }

  async load(): Promise<void> {
    console.log("[Storage] Loading state from:", this.paths.stateFile);
    try {
      const raw = await readFile(this.paths.stateFile, "utf8");
      this.state = {
        ...DEFAULT_STATE(),
        ...JSON.parse(raw),
      } as PersistedStateFile;
      console.log("[Storage] State loaded successfully.");
    } catch {
      console.log("[Storage] No state file found or error, using default.");
      this.state = DEFAULT_STATE();
      await this.save();
    }
  }

  async save(): Promise<void> {
    await writeFile(this.paths.stateFile, JSON.stringify(this.state, null, 2), "utf8");
  }

  getDeviceId(): string {
    return this.state.deviceId;
  }

  getDeviceLockSummary(): DeviceLockSummary {
    return {
      deviceId: this.state.deviceId,
      lockedEmail: null,
    };
  }

  getCurrentAccount(): AccountSummary | null {
    return this.state.account;
  }

  requireCurrentAccount(): AccountSummary {
    if (!this.state.account) {
      throw new Error("Connecte-toi a ton compte OpenVMC avant de creer un serveur.");
    }
    return this.state.account;
  }

  getAuthToken(): string | null {
    return this.state.authToken;
  }

  async setAuthSession(token: string, account: AccountSummary): Promise<void> {
    this.state.authToken = token;
    this.state.account = account;
    await this.save();
  }

  async updateAccount(account: AccountSummary | null): Promise<void> {
    this.state.account = account;
    if (!account) {
      this.state.authToken = null;
    }
    await this.save();
  }

  async clearAuthSession(): Promise<void> {
    this.state.authToken = null;
    this.state.account = null;
    await this.save();
  }

  getServers(): PersistedServerRecord[] {
    return [...this.state.servers];
  }

  findServer(serverUuid: string): PersistedServerRecord | null {
    return this.state.servers.find((server) => server.serverUuid === serverUuid) ?? null;
  }

  getSnapshot(activeServerId: string | null, catalog: LauncherSnapshot["catalog"]): LauncherSnapshot {
    return {
      account: this.state.account,
      deviceLock: this.getDeviceLockSummary(),
      activeServerId,
      servers: this.getServers(),
      catalog,
    };
  }

  async addServer(server: PersistedServerRecord): Promise<void> {
    this.state.servers.push(server);
    await this.save();
  }

  async updateServer(
    serverUuid: string,
    updater: (server: PersistedServerRecord) => PersistedServerRecord,
  ): Promise<PersistedServerRecord> {
    const index = this.state.servers.findIndex((server) => server.serverUuid === serverUuid);
    if (index === -1) {
      throw new Error("Server not found");
    }
    const updated = updater(this.state.servers[index]);
    this.state.servers[index] = updated;
    await this.save();
    return updated;
  }

  async deleteServer(serverUuid: string): Promise<void> {
    const index = this.state.servers.findIndex((server) => server.serverUuid === serverUuid);
    if (index !== -1) {
      this.state.servers.splice(index, 1);
      await this.save();
    }
  }

  getNextPortBlock(): number {
    const highestPort = this.state.servers.reduce((max, server) => {
      return Math.max(max, server.paperPort, server.velocityPort ?? 0);
    }, 25564);
    return Math.max(25565, Math.floor(highestPort / 10) * 10 + 10);
  }
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "openvmc-server";
}
