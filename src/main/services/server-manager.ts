import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, stat, writeFile, rm, rename, cp } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type {
  ConsoleLine,
  CreateServerPayload,
  LauncherEvent,
  PluginInstallRequest,
  PluginInstallResult,
  PluginProvider,
  PluginSearchResult,
  ServerDetails,
  ServerFileContent,
  ServerRecord,
  ServerStats,
  UpdateServerSettingsPayload,
  UpdateServerDisplayNamePayload,
  UpdateVmcSettingsPayload,
} from "../../shared/contracts";
import { DEFAULT_SERVER_SETTINGS } from "../../shared/contracts";
import { OpenVmcAuthClient } from "./auth-client";
import { JavaRuntimeManager } from "./java-runtime";
import { downloadFile, resolvePaperArtifact, resolveVelocityArtifact } from "./downloads";
import {
  PluginMarketplaceService,
  getPaperPluginsDirectory,
} from "./plugin-marketplaces";
import {
  LauncherStateStore,
  type PersistedServerRecord,
  slugify,
} from "./storage";

interface RuntimeProcess {
  name: "paper" | "velocity";
  child: ChildProcessWithoutNullStreams;
}

interface RuntimeState {
  startedAt: number | null;
  isStopping: boolean;
  consoleLines: ConsoleLine[];
  processes: Partial<Record<"paper" | "velocity", RuntimeProcess>>;
  stats: ServerStats;
  statsTimer: NodeJS.Timeout | null;
}

const MAX_CONSOLE_LINES = 500;
const STATS_REFRESH_INTERVAL_MS = 2_000;
const MAX_EDITABLE_FILE_BYTES = 1024 * 1024;
const execFileAsync = promisify(execFile);

export class ServerManager {
  private readonly runtimes = new Map<string, RuntimeState>();
  private activeServerId: string | null = null;
  private readonly pluginMarketplace: PluginMarketplaceService;

  constructor(
    private readonly stateStore: LauncherStateStore,
    private readonly authClient: OpenVmcAuthClient,
    private readonly javaManager: JavaRuntimeManager,
    private readonly cacheDir: string,
    private readonly emitEvent: (event: LauncherEvent) => void,
  ) {
    this.pluginMarketplace = new PluginMarketplaceService(
      cacheDir,
      () => process.env.VMC_CURSEFORGE_API_KEY?.trim() || null,
    );
  }

  getActiveServerId(): string | null {
    return this.activeServerId;
  }

  async createServer(payload: CreateServerPayload): Promise<ServerRecord> {
    const owner = this.stateStore.requireCurrentAccount();
    const now = new Date().toISOString();
    const serverUuid = randomUUID();
    const slug = slugify(payload.displayName);
    const portBlock = this.stateStore.getNextPortBlock();
    const token = this.stateStore.getAuthToken();
    if (!token) {
      throw new Error("Session OpenVMC indisponible.");
    }
    const rootDir = path.join(this.stateStore.getPaths().serversDir, `${slug}-${serverUuid}`);
    const remoteServer = await this.authClient.createRemoteServer(
      token,
      this.stateStore.getDeviceId(),
      payload,
      serverUuid,
    );
    const server: PersistedServerRecord = {
      serverUuid,
      ownerAccountId: owner.id,
      remoteServerId: remoteServer.id,
      displayName: payload.displayName.trim(),
      slug,
      kind: payload.kind,
      version: payload.version,
      memoryMb: payload.memoryMb,
      status: "stopped",
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: null,
      rootDir,
      paperPort: payload.kind === "paper" ? portBlock : portBlock + 1,
      velocityPort: payload.kind === "paper-vmc" ? portBlock : null,
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        motd: payload.displayName.trim(),
      },
      vmc: {
        enabled: payload.kind === "paper-vmc",
        slug,
        mode: payload.vmcMode ?? "whitelist",
        whitelist: [owner.displayName],
        lastAccessCode: null,
        lastAccessCodeIssuedAt: null,
        state: payload.kind === "paper-vmc" ? "connected" : "disabled",
      },
    };

    await this.ensureServerLayout(server);
    await this.writePaperConfiguration(server);
    if (server.kind === "paper-vmc") await this.writeVelocityConfiguration(server);

    await this.stateStore.addServer(server);
    return server;
  }

  async getServerDetails(serverUuid: string): Promise<ServerDetails> {
    const server = this.requireServer(serverUuid);
    const runtime = this.runtimes.get(serverUuid);
    const stats = {
      ...(runtime?.stats ?? buildInitialStats(server)),
      uptimeSeconds: runtime?.startedAt ? Math.max(0, Math.floor((Date.now() - runtime.startedAt) / 1000)) : 0,
      storageMb: Math.ceil((await measureDirectoryBytes(server.rootDir)) / (1024 * 1024)),
    };

    return {
      server,
      stats,
      consoleLines: runtime?.consoleLines ?? [],
      files: await readManagedFiles(server.rootDir),
      plugins: await this.pluginMarketplace.listInstalledPlugins(server),
    };
  }

  async startServer(serverUuid: string): Promise<void> {
    const server = this.requireServer(serverUuid);
    if (this.runtimes.has(serverUuid)) {
      return;
    }

    await this.patchServer(serverUuid, (current) => ({
      ...current,
      status: "starting",
      updatedAt: new Date().toISOString(),
    }));

    const runtime: RuntimeState = {
      startedAt: Date.now(),
      isStopping: false,
      consoleLines: [],
      processes: {},
      stats: buildInitialStats(server),
      statsTimer: null,
    };
    this.runtimes.set(serverUuid, runtime);
    this.activeServerId = serverUuid;
    this.emitEvent({ type: "state-changed", serverUuid });

    try {
      const javaExecutable = await this.javaManager.ensureJavaExecutable();
      await this.prepareServerFiles(server);

      const paperJar = path.join(server.rootDir, "paper", "paper.jar");
      runtime.processes.paper = this.spawnProcess(
        server,
        runtime,
        "paper",
        javaExecutable,
        [`-Xms${server.memoryMb}M`, `-Xmx${server.memoryMb}M`, "-jar", paperJar, "--nogui"],
        path.join(server.rootDir, "paper"),
      );

      if (server.kind === "paper-vmc") {
        const velocityJar = path.join(server.rootDir, "velocity", "velocity.jar");
        runtime.processes.velocity = this.spawnProcess(
          server,
          runtime,
          "velocity",
          javaExecutable,
          ["-Xms512M", "-Xmx512M", "-jar", velocityJar],
          path.join(server.rootDir, "velocity"),
        );
      }

      this.startStatsPolling(server, runtime);

      await this.patchServer(serverUuid, (current) => ({
        ...current,
        status: "running",
        updatedAt: new Date().toISOString(),
        lastPlayedAt: new Date().toISOString(),
      }));
      this.appendConsoleLine(runtime, "info", `OpenVMC: serveur ${server.displayName} demarre.`);
    } catch (error) {
      this.appendConsoleLine(runtime, "error", `OpenVMC: ${(error as Error).message}`);
      this.runtimes.delete(serverUuid);
      this.activeServerId = null;
      await this.patchServer(serverUuid, (current) => ({
        ...current,
        status: "error",
        updatedAt: new Date().toISOString(),
      }));
      throw error;
    } finally {
      this.emitEvent({ type: "server-updated", serverUuid });
    }
  }

  async stopServer(serverUuid: string): Promise<void> {
    const runtime = this.runtimes.get(serverUuid);
    if (!runtime) {
      await this.patchServer(serverUuid, (current) => ({
        ...current,
        status: "stopped",
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    runtime.isStopping = true;
    await this.patchServer(serverUuid, (current) => ({
      ...current,
      status: "stopping",
      updatedAt: new Date().toISOString(),
    }));

    const processes = Object.values(runtime.processes).filter(Boolean) as RuntimeProcess[];
    for (const process of processes) {
      if (process.name === "velocity") {
        process.child.stdin.write("shutdown\n");
      } else {
        process.child.stdin.write("stop\n");
      }
    }

    await Promise.all(processes.map((process) => waitForProcessExit(process.child, 10_000)));
    this.stopStatsPolling(runtime);
    this.runtimes.delete(serverUuid);
    if (this.activeServerId === serverUuid) {
      this.activeServerId = null;
    }

    await this.patchServer(serverUuid, (current) => ({
      ...current,
      status: "stopped",
      updatedAt: new Date().toISOString(),
    }));
    this.emitEvent({ type: "state-changed", serverUuid });
  }

  async sendConsoleCommand(serverUuid: string, command: string): Promise<void> {
    const runtime = this.runtimes.get(serverUuid);
    if (!runtime) {
      throw new Error("Le serveur n'est pas demarre.");
    }

    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    const target = trimmed.startsWith("proxy:") ? runtime.processes.velocity : runtime.processes.paper;
    if (!target) {
      throw new Error("Console cible indisponible.");
    }

    const actualCommand = trimmed.startsWith("proxy:") ? trimmed.slice("proxy:".length).trim() : trimmed;
    target.child.stdin.write(`${actualCommand}\n`);
    this.appendConsoleLine(runtime, "command", `> ${trimmed}`);
    this.emitEvent({ type: "server-updated", serverUuid });
  }

  async readServerFile(serverUuid: string, relativePath: string): Promise<ServerFileContent> {
    const server = this.requireServer(serverUuid);
    const absolutePath = await this.resolveEditableFilePath(server, relativePath);
    const buffer = await readFile(absolutePath);
    if (buffer.length > MAX_EDITABLE_FILE_BYTES) {
      throw new Error("Le fichier est trop volumineux pour l'editeur integre (max 1 MiB).");
    }
    if (buffer.includes(0)) {
      throw new Error("Les fichiers binaires ne sont pas pris en charge par l'editeur.");
    }

    const fileStat = await stat(absolutePath);
    return {
      path: path.relative(server.rootDir, absolutePath),
      content: buffer.toString("utf8"),
      modifiedAt: fileStat.mtime.toISOString(),
    };
  }

  async writeServerFile(serverUuid: string, relativePath: string, content: string) {
    const server = this.requireServer(serverUuid);
    const absolutePath = await this.resolveEditableFilePath(server, relativePath);
    await writeFile(absolutePath, content, "utf8");
    const fileStat = await stat(absolutePath);
    this.emitEvent({ type: "server-updated", serverUuid });
    return {
      name: path.basename(absolutePath),
      path: path.relative(server.rootDir, absolutePath),
      kind: "file" as const,
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    };
  }

  async searchPlugins(
    serverUuid: string,
    provider: PluginProvider,
    query: string,
  ): Promise<PluginSearchResult[]> {
    const server = this.requireServer(serverUuid);
    return this.pluginMarketplace.search(server, provider, query.trim());
  }

  async installPlugin(payload: PluginInstallRequest): Promise<PluginInstallResult> {
    const server = this.requireServer(payload.serverUuid);
    const result = await this.pluginMarketplace.install(server, payload);
    this.emitEvent({ type: "server-updated", serverUuid: payload.serverUuid });
    return result;
  }

  async updateServerSettings(payload: UpdateServerSettingsPayload): Promise<ServerRecord> {
    const updated = await this.patchServer(payload.serverUuid, (server) => ({
      ...server,
      settings: { ...server.settings, ...payload.settings },
      updatedAt: new Date().toISOString(),
    }));
    await this.writePaperConfiguration(updated);
    return updated;
  }

  async updateVmcSettings(payload: UpdateVmcSettingsPayload): Promise<ServerRecord> {
    const updated = await this.patchServer(payload.serverUuid, (server) => ({
      ...server,
      vmc: { ...server.vmc, ...payload.vmc },
      updatedAt: new Date().toISOString(),
    }));
    if (updated.kind === "paper-vmc") {
      await this.writeVelocityConfiguration(updated);
    }
    return updated;
  }

  async updateServerDisplayName(payload: { serverUuid: string; displayName: string }): Promise<ServerRecord> {
    const displayName = payload.displayName.trim();
    if (!displayName) {
      throw new Error("Le nom du serveur ne peut pas être vide");
    }
    const updated = await this.patchServer(payload.serverUuid, (server) => ({
      ...server,
      displayName,
      updatedAt: new Date().toISOString(),
    }));
    this.emitEvent({ type: "server-updated", serverUuid: payload.serverUuid });
    return updated;
  }

  async deleteServer(serverUuid: string): Promise<void> {
    const server = this.requireServer(serverUuid);
    
    // Stop server if running
    if (this.runtimes.has(serverUuid)) {
      await this.stopServer(serverUuid);
    }
    
    // Remove from state
    await this.stateStore.deleteServer(serverUuid);
    this.emitEvent({ type: "state-changed" });
  }

  private async prepareServerFiles(server: PersistedServerRecord): Promise<void> {
    const paperArtifact = await resolvePaperArtifact(server.version);
    const cachedPaperJar = path.join(this.cacheDir, paperArtifact.fileName);
    await downloadFile(paperArtifact.url, cachedPaperJar);
    await copyFile(cachedPaperJar, path.join(server.rootDir, "paper", "paper.jar"));
    await this.writePaperConfiguration(server);

    if (server.kind !== "paper-vmc") {
      return;
    }

    const velocityArtifact = await resolveVelocityArtifact();
    const cachedVelocityJar = path.join(this.cacheDir, velocityArtifact.fileName);
    await downloadFile(velocityArtifact.url, cachedVelocityJar);
    await copyFile(cachedVelocityJar, path.join(server.rootDir, "velocity", "velocity.jar"));
    await this.writeVelocityConfiguration(server);
  }

  private async ensureServerLayout(server: PersistedServerRecord): Promise<void> {
    await mkdir(server.rootDir, { recursive: true });
    await mkdir(path.join(server.rootDir, "paper"), { recursive: true });
    await mkdir(getPaperPluginsDirectory(server), { recursive: true });
    if (server.kind === "paper-vmc") {
      await mkdir(path.join(server.rootDir, "velocity"), { recursive: true });
      await mkdir(path.join(server.rootDir, "velocity", "plugins"), { recursive: true });
    }
  }

  private async writePaperConfiguration(server: PersistedServerRecord): Promise<void> {
    const paperDir = path.join(server.rootDir, "paper");
    await mkdir(paperDir, { recursive: true });
    await writeFile(path.join(paperDir, "eula.txt"), "eula=true\n", "utf8");
    await writeFile(path.join(paperDir, "server.properties"), buildPaperProperties(server), "utf8");
  }

  private async writeVelocityConfiguration(server: PersistedServerRecord): Promise<void> {
    if (server.velocityPort === null) {
      return;
    }

    const velocityDir = path.join(server.rootDir, "velocity");
    await mkdir(velocityDir, { recursive: true });
    await writeFile(path.join(velocityDir, "velocity.toml"), buildVelocityToml(server), "utf8");
  }

  private spawnProcess(
    server: PersistedServerRecord,
    runtime: RuntimeState,
    name: "paper" | "velocity",
    executable: string,
    args: string[],
    cwd: string,
  ): RuntimeProcess {
    const child = spawn(executable, args, {
      cwd,
      stdio: "pipe",
    });

    child.stdout.on("data", (chunk) => {
      appendOutput(runtime, "info", `[${name}] ${chunk.toString("utf8")}`, this.emitEvent, server.serverUuid);
    });
    child.stderr.on("data", (chunk) => {
      appendOutput(runtime, "error", `[${name}] ${chunk.toString("utf8")}`, this.emitEvent, server.serverUuid);
    });

    child.on("close", async (code) => {
      appendOutput(runtime, code === 0 ? "info" : "error", `[${name}] process exited with code ${code ?? 0}`, this.emitEvent, server.serverUuid);
      delete runtime.processes[name];

      if (!runtime.isStopping) {
        runtime.isStopping = true;
        this.stopStatsPolling(runtime);
        const otherProcesses = Object.values(runtime.processes).filter(Boolean) as RuntimeProcess[];
        for (const other of otherProcesses) {
          other.child.kill("SIGTERM");
        }
        this.runtimes.delete(server.serverUuid);
        if (this.activeServerId === server.serverUuid) {
          this.activeServerId = null;
        }
        await this.patchServer(server.serverUuid, (current) => ({
          ...current,
          status: code === 0 ? "stopped" : "error",
          updatedAt: new Date().toISOString(),
        }));
        this.emitEvent({ type: "state-changed", serverUuid: server.serverUuid });
      }
    });

    return { name, child };
  }

  private appendConsoleLine(runtime: RuntimeState, level: ConsoleLine["level"], text: string): void {
    runtime.consoleLines.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      text,
    });
    if (runtime.consoleLines.length > MAX_CONSOLE_LINES) {
      runtime.consoleLines.splice(0, runtime.consoleLines.length - MAX_CONSOLE_LINES);
    }
  }

  private startStatsPolling(server: PersistedServerRecord, runtime: RuntimeState): void {
    this.stopStatsPolling(runtime);
    void this.refreshRuntimeStats(server, runtime);
    runtime.statsTimer = setInterval(() => {
      void this.refreshRuntimeStats(server, runtime);
    }, STATS_REFRESH_INTERVAL_MS);
  }

  private stopStatsPolling(runtime: RuntimeState): void {
    if (runtime.statsTimer) {
      clearInterval(runtime.statsTimer);
      runtime.statsTimer = null;
    }
  }

  private async refreshRuntimeStats(server: PersistedServerRecord, runtime: RuntimeState): Promise<void> {
    const pids = Object.values(runtime.processes)
      .filter((process): process is RuntimeProcess => Boolean(process))
      .map((process) => process.child.pid)
      .filter((pid): pid is number => typeof pid === "number" && pid > 0);

    const processStats = pids.length > 0 ? await collectProcessStats(pids) : { cpuPercent: 0, ramUsedMb: 0 };
    runtime.stats = {
      uptimeSeconds: runtime.startedAt ? Math.max(0, Math.floor((Date.now() - runtime.startedAt) / 1000)) : 0,
      cpuPercent: processStats.cpuPercent,
      cpuLimitPercent: 100,
      ramUsedMb: processStats.ramUsedMb,
      ramLimitMb: getRamLimitMb(server),
      storageMb: runtime.stats.storageMb,
    };
    this.emitEvent({ type: "server-updated", serverUuid: server.serverUuid });
  }

  private requireServer(serverUuid: string): PersistedServerRecord {
    const server = this.stateStore.findServer(serverUuid);
    if (!server) {
      throw new Error("Server not found");
    }
    return server;
  }

  private async patchServer(
    serverUuid: string,
    updater: (server: PersistedServerRecord) => PersistedServerRecord,
  ): Promise<PersistedServerRecord> {
    const updated = await this.stateStore.updateServer(serverUuid, updater);
    this.emitEvent({ type: "server-updated", serverUuid });
    return updated;
  }

  private async resolveEditableFilePath(server: PersistedServerRecord, relativePath: string): Promise<string> {
    const sanitized = relativePath.trim();
    if (!sanitized) {
      throw new Error("Chemin de fichier invalide.");
    }

    const normalized = path.normalize(sanitized);
    const absolutePath = path.resolve(server.rootDir, normalized);
    const rootDir = path.resolve(server.rootDir);
    if (absolutePath !== rootDir && !absolutePath.startsWith(`${rootDir}${path.sep}`)) {
      throw new Error("Acces fichier refuse.");
    }

    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      throw new Error("Seuls les fichiers peuvent etre ouverts.");
    }

    return absolutePath;
  }
}

function appendOutput(
  runtime: RuntimeState,
  level: ConsoleLine["level"],
  raw: string,
  emitEvent: (event: LauncherEvent) => void,
  serverUuid: string,
): void {
  for (const line of raw
    .split(/\r?\n/)
    .map((entry) => stripAnsi(entry).trimEnd())
    .filter((entry) => entry.trim().length > 0)) {
    runtime.consoleLines.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      text: line,
    });
  }

  if (runtime.consoleLines.length > MAX_CONSOLE_LINES) {
    runtime.consoleLines.splice(0, runtime.consoleLines.length - MAX_CONSOLE_LINES);
  }

  emitEvent({ type: "server-updated", serverUuid });
}

function buildInitialStats(server: PersistedServerRecord): ServerStats {
  return {
    uptimeSeconds: 0,
    cpuPercent: 0,
    cpuLimitPercent: 100,
    ramUsedMb: 0,
    ramLimitMb: getRamLimitMb(server),
    storageMb: 0,
  };
}

async function waitForProcessExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve();
    }, timeoutMs);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function buildPaperProperties(server: PersistedServerRecord): string {
  const onlineMode = server.kind === "paper" ? "true" : "false";
  const serverIp = server.kind === "paper" ? "" : "127.0.0.1";

  return [
    `motd=${escapePropertiesValue(server.settings.motd)}`,
    `difficulty=${server.settings.difficulty}`,
    `gamemode=${server.settings.gamemode}`,
    `max-players=${server.settings.maxPlayers}`,
    `max-tick-time=${server.settings.maxTickTime}`,
    `max-world-size=${server.settings.maxWorldSize}`,
    `pvp=${server.settings.pvp}`,
    `spawn-protection=${server.settings.spawnProtection}`,
    `rate-limit=${server.settings.rateLimit}`,
    `view-distance=${server.settings.viewDistance}`,
    `simulation-distance=${server.settings.simulationDistance}`,
    `server-port=${server.paperPort}`,
    `online-mode=${onlineMode}`,
    `server-ip=${serverIp}`,
    "enable-query=false",
    "enable-rcon=false",
    "sync-chunk-writes=true",
  ].join("\n").concat("\n");
}

function getRamLimitMb(server: PersistedServerRecord): number {
  return server.memoryMb + (server.kind === "paper-vmc" ? 512 : 0);
}

async function collectProcessStats(pids: number[]): Promise<Pick<ServerStats, "cpuPercent" | "ramUsedMb">> {
  try {
    if (process.platform === "win32") {
      return collectWindowsProcessStats(pids);
    }
    return collectPosixProcessStats(pids);
  } catch {
    return { cpuPercent: 0, ramUsedMb: 0 };
  }
}

async function collectPosixProcessStats(pids: number[]): Promise<Pick<ServerStats, "cpuPercent" | "ramUsedMb">> {
  const { stdout } = await execFileAsync("ps", ["-o", "pid=,%cpu=,rss=", "-p", pids.join(",")]);
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cpuCores = Math.max(1, availableParallelism());
  let totalCpu = 0;
  let totalRssKb = 0;

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }
    totalCpu += Number.parseFloat(parts[1]) || 0;
    totalRssKb += Number.parseInt(parts[2] ?? "0", 10) || 0;
  }

  return {
    cpuPercent: Math.max(0, Math.round((totalCpu / cpuCores) * 10) / 10),
    ramUsedMb: Math.max(0, Math.round(totalRssKb / 1024)),
  };
}

async function collectWindowsProcessStats(pids: number[]): Promise<Pick<ServerStats, "cpuPercent" | "ramUsedMb">> {
  const powershellScript = [
    `$ids = @(${pids.join(",")})`,
    "Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |",
    "  Where-Object { $ids -contains $_.IDProcess } |",
    "  ForEach-Object { \"{0}|{1}|{2}\" -f $_.IDProcess, $_.PercentProcessorTime, $_.WorkingSet }",
  ].join(" ");
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-Command",
    powershellScript,
  ]);

  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cpuCores = Math.max(1, availableParallelism());
  let totalCpu = 0;
  let totalWorkingSet = 0;

  for (const line of lines) {
    const [, cpuRaw, workingSetRaw] = line.split("|");
    totalCpu += Number.parseFloat(cpuRaw) || 0;
    totalWorkingSet += Number.parseInt(workingSetRaw ?? "0", 10) || 0;
  }

  return {
    cpuPercent: Math.max(0, Math.round((totalCpu / cpuCores) * 10) / 10),
    ramUsedMb: Math.max(0, Math.round(totalWorkingSet / (1024 * 1024))),
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function buildVelocityToml(server: PersistedServerRecord): string {
  if (server.velocityPort === null) {
    throw new Error("Velocity port missing for proxy server.");
  }

  return [
    'config-version = "2.7"',
    `bind = "0.0.0.0:${server.velocityPort}"`,
    `motd = "<green>${escapeMiniMessage(server.settings.motd)}"`,
    "show-max-players = 500",
    "online-mode = true",
    "force-key-authentication = true",
    'player-info-forwarding-mode = "none"',
    'forwarding-secret-file = "forwarding.secret"',
    "announce-forge = false",
    "kick-existing-players = false",
    'ping-passthrough = "DISABLED"',
    "",
    "[servers]",
    `paper = "127.0.0.1:${server.paperPort}"`,
    'try = ["paper"]',
    "",
    "[forced-hosts]",
    "",
    "[advanced]",
    "compression-threshold = 256",
    "compression-level = -1",
    "login-ratelimit = 3000",
    "connection-timeout = 5000",
    "read-timeout = 30000",
    "haproxy-protocol = false",
    "tcp-fast-open = false",
    "bungee-plugin-message-channel = true",
    "show-ping-requests = false",
    "failover-on-unexpected-server-disconnect = true",
    "announce-proxy-commands = true",
    "log-command-executions = false",
    "log-player-connections = true",
    "accepts-transfers = false",
    "enable-reuse-port = false",
    "command-rate-limit = 50",
    "forward-commands-if-rate-limited = true",
    "kick-after-rate-limited-commands = 0",
    "tab-complete-rate-limit = 10",
    "kick-after-rate-limited-tab-completes = 0",
  ].join("\n").concat("\n");
}

function escapePropertiesValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, " ");
}

function escapeMiniMessage(value: string): string {
  return value.replace(/[<>]/g, "");
}

async function readManagedFiles(rootDir: string) {
  const results: ServerDetails["files"] = [];
  await walkManagedFiles(rootDir, rootDir, results);
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

async function walkManagedFiles(rootDir: string, currentDir: string, results: ServerDetails["files"]): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const fileStat = await stat(absolutePath);
    const relativePath = path.relative(rootDir, absolutePath) || entry.name;
    results.push({
      name: entry.name,
      path: relativePath,
      kind: entry.isDirectory() ? "directory" : "file",
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });
    if (entry.isDirectory() && relativePath.split(path.sep).length < 3) {
      await walkManagedFiles(rootDir, absolutePath, results);
    }
  }
}

async function measureDirectoryBytes(rootDir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      total += await measureDirectoryBytes(entryPath);
    } else {
      total += (await stat(entryPath)).size;
    }
  }

  return total;
}
