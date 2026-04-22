import { copyFile } from "node:fs/promises";
import path from "node:path";
import type {
  PluginInstallRequest,
  PluginInstallResult,
  PluginSearchResult,
} from "../../shared/contracts";
import type { PersistedServerRecord } from "./storage";
import { OPENVMC_USER_AGENT, downloadFile } from "./downloads";

const MODRINTH_API_ROOT = "https://api.modrinth.com/v2";
const CURSEFORGE_API_ROOT = "https://api.curseforge.com/v1";
const HANGAR_API_ROOT = "https://hangar.papermc.io/api/v1";
const CURSEFORGE_MINECRAFT_GAME_ID = 432;
const CURSEFORGE_BUKKIT_PLUGINS_CLASS_ID = 5;
const PAPER_LOADERS = ["paper", "folia", "purpur", "spigot", "bukkit"] as const;

interface ModrinthSearchResponse {
  hits: Array<{
    project_id: string;
    slug: string;
    author: string;
    title: string;
    description: string;
    icon_url: string | null;
    downloads: number;
    display_categories: string[];
    versions: string[];
    date_modified: string;
    latest_version: string | null;
  }>;
}

interface ModrinthVersion {
  id: string;
  version_number: string;
  version_type: "release" | "beta" | "alpha";
  featured: boolean;
  date_published: string;
  game_versions: string[];
  files: Array<{
    url: string;
    filename: string;
    primary: boolean;
  }>;
}

interface CurseForgeResponse<T> {
  data: T;
}

interface CurseForgeSearchResult {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  dateModified: string;
  logo?: { thumbnailUrl?: string | null } | null;
  authors?: Array<{ name: string }>;
  links?: { websiteUrl?: string | null };
  latestFilesIndexes?: Array<{
    filename?: string;
    gameVersion?: string;
  }>;
  categories?: Array<{ name?: string }>;
}

interface CurseForgeFile {
  id: number;
  displayName: string;
  fileName: string;
  fileDate: string;
  releaseType: number;
  downloadUrl: string | null;
  gameVersions: string[];
}

interface HangarSearchResponse {
  result: Array<{
    name: string;
    description: string;
    category: string;
    lastUpdated: string;
    avatarUrl?: string | null;
    namespace: {
      owner: string;
      slug: string;
    };
    stats: {
      downloads: number;
    };
  }>;
}

interface HangarVersionResponse {
  result: HangarVersion[];
}

interface HangarVersion {
  name?: string;
  createdAt?: string;
  channel?: { name?: string };
  platformDependencies?: Record<string, unknown>;
  platforms?: Record<string, unknown>;
  downloads?: Record<string, {
    downloadUrl?: string | null;
    externalUrl?: string | null;
  } | null>;
}

export class PluginMarketplaceService {
  constructor(
    private readonly cacheDir: string,
    private readonly getCurseForgeApiKey: () => string | null,
  ) {}

  async search(server: PersistedServerRecord, provider: PluginInstallRequest["provider"], query: string): Promise<PluginSearchResult[]> {
    switch (provider) {
      case "modrinth":
        return this.searchModrinth(server, query);
      case "curseforge":
        return this.searchCurseForge(server, query);
      case "hangar":
        return this.searchHangar(query, server.version);
      default:
        return [];
    }
  }

  async install(server: PersistedServerRecord, request: PluginInstallRequest): Promise<PluginInstallResult> {
    switch (request.provider) {
      case "modrinth":
        return this.installFromModrinth(server, request);
      case "curseforge":
        return this.installFromCurseForge(server, request);
      case "hangar":
        return this.installFromHangar(server, request);
      default:
        throw new Error("Source de plugin non supportee.");
    }
  }

  async listInstalledPlugins(server: PersistedServerRecord) {
    const { readdir, stat } = await import("node:fs/promises");
    const pluginsDir = getPaperPluginsDirectory(server);

    try {
      const entries = await readdir(pluginsDir, { withFileTypes: true });
      const plugins = await Promise.all(entries
        .filter((entry) => entry.isFile() && /\.(jar|jar\.disabled)$/i.test(entry.name))
        .map(async (entry) => {
          const absolutePath = path.join(pluginsDir, entry.name);
          const fileStat = await stat(absolutePath);
          const enabled = !entry.name.toLowerCase().endsWith(".disabled");
          const displayName = entry.name.replace(/\.jar(?:\.disabled)?$/i, "");
          return {
            id: `${displayName}:${fileStat.mtimeMs}`,
            fileName: entry.name,
            displayName,
            path: absolutePath,
            enabled,
            size: fileStat.size,
            modifiedAt: fileStat.mtime.toISOString(),
          };
        }));
      return plugins.sort((left, right) => left.fileName.localeCompare(right.fileName));
    } catch {
      return [];
    }
  }

  private async searchModrinth(server: PersistedServerRecord, query: string): Promise<PluginSearchResult[]> {
    const facets = JSON.stringify([
      PAPER_LOADERS.map((loader) => `categories:${loader}`),
      ["server_side:required", "server_side:optional", "server_side:unknown"],
    ]);
    const params = new URLSearchParams({
      query,
      limit: "20",
      facets,
      index: "downloads",
    });
    const response = await fetchJson<ModrinthSearchResponse>(
      `${MODRINTH_API_ROOT}/search?${params.toString()}`,
    );

    return response.hits.map((hit) => ({
      provider: "modrinth",
      projectId: hit.project_id,
      slug: hit.slug,
      author: hit.author,
      title: hit.title,
      summary: hit.description,
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      categories: hit.display_categories,
      updatedAt: hit.date_modified,
      latestVersionLabel: hit.latest_version,
      websiteUrl: `https://modrinth.com/plugin/${hit.slug}`,
      compatibleWithServer: hit.versions.includes(server.version),
    }));
  }

  private async searchCurseForge(server: PersistedServerRecord, query: string): Promise<PluginSearchResult[]> {
    const apiKey = this.requireCurseForgeApiKey();
    const params = new URLSearchParams({
      gameId: String(CURSEFORGE_MINECRAFT_GAME_ID),
      classId: String(CURSEFORGE_BUKKIT_PLUGINS_CLASS_ID),
      searchFilter: query,
      gameVersion: server.version,
      pageSize: "20",
      sortField: "2",
      sortOrder: "desc",
    });
    const response = await fetchJson<CurseForgeResponse<CurseForgeSearchResult[]>>(
      `${CURSEFORGE_API_ROOT}/mods/search?${params.toString()}`,
      {
        "x-api-key": apiKey,
      },
    );

    return response.data.map((item) => ({
      provider: "curseforge",
      projectId: String(item.id),
      slug: item.slug,
      author: item.authors?.map((author) => author.name).join(", ") || "CurseForge",
      title: item.name,
      summary: item.summary,
      iconUrl: item.logo?.thumbnailUrl ?? null,
      downloads: item.downloadCount,
      categories: item.categories?.map((category) => category.name).filter(Boolean) as string[] ?? [],
      updatedAt: item.dateModified,
      latestVersionLabel: item.latestFilesIndexes?.find((entry) => entry.gameVersion === server.version)?.filename ?? null,
      websiteUrl: item.links?.websiteUrl ?? `https://www.curseforge.com/minecraft/bukkit-plugins/${item.slug}`,
      compatibleWithServer: item.latestFilesIndexes?.some((entry) => entry.gameVersion === server.version) ?? false,
    }));
  }

  private async searchHangar(query: string, minecraftVersion: string): Promise<PluginSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      limit: "20",
      offset: "0",
      sort: "-downloads",
    });
    const response = await fetchJson<HangarSearchResponse>(
      `${HANGAR_API_ROOT}/projects?${params.toString()}`,
    );

    return response.result.map((project) => ({
      provider: "hangar" as const,
      projectId: `${project.namespace.owner}/${project.namespace.slug}`,
      slug: project.namespace.slug,
      author: project.namespace.owner,
      title: project.name,
      summary: project.description,
      iconUrl: project.avatarUrl ?? null,
      downloads: project.stats.downloads,
      categories: [project.category],
      updatedAt: project.lastUpdated,
      latestVersionLabel: null,
      websiteUrl: `https://hangar.papermc.io/${project.namespace.owner}/${project.namespace.slug}`,
      compatibleWithServer: true,
    })).sort((left, right) => {
      if (left.compatibleWithServer !== right.compatibleWithServer) {
        return left.compatibleWithServer ? -1 : 1;
      }
      return compareNullableDates(right.updatedAt, left.updatedAt);
    }).map((result) => ({
      ...result,
      compatibleWithServer: result.compatibleWithServer || result.title.includes(minecraftVersion),
    }));
  }

  private async installFromModrinth(server: PersistedServerRecord, request: PluginInstallRequest): Promise<PluginInstallResult> {
    const params = new URLSearchParams({
      loaders: JSON.stringify([...PAPER_LOADERS]),
      game_versions: JSON.stringify([server.version]),
      include_changelog: "false",
    });
    const versions = await fetchJson<ModrinthVersion[]>(
      `${MODRINTH_API_ROOT}/project/${encodeURIComponent(request.projectId)}/version?${params.toString()}`,
    );
    const selectedVersion = [...versions]
      .sort(compareModrinthVersions)
      .find((version) => selectJarFile(version.files));

    if (!selectedVersion) {
      throw new Error(`Aucune version Modrinth compatible avec Paper ${server.version}.`);
    }

    const selectedFile = selectJarFile(selectedVersion.files);
    if (!selectedFile) {
      throw new Error("Le projet Modrinth ne contient pas de JAR installable.");
    }

    const installedPath = await this.installDownloadedFile(server, {
      provider: "modrinth",
      projectKey: request.projectId,
      versionKey: selectedVersion.id,
      downloadUrl: selectedFile.url,
      fileName: selectedFile.filename,
    });

    return {
      provider: "modrinth",
      pluginName: request.slug,
      fileName: selectedFile.filename,
      targetPath: installedPath,
    };
  }

  private async installFromCurseForge(server: PersistedServerRecord, request: PluginInstallRequest): Promise<PluginInstallResult> {
    const apiKey = this.requireCurseForgeApiKey();
    const filesResponse = await fetchJson<CurseForgeResponse<CurseForgeFile[]>>(
      `${CURSEFORGE_API_ROOT}/mods/${encodeURIComponent(request.projectId)}/files?${new URLSearchParams({
        gameVersion: server.version,
        pageSize: "50",
      }).toString()}`,
      {
        "x-api-key": apiKey,
      },
    );

    const selectedFile = [...filesResponse.data]
      .filter((file) => file.gameVersions.includes(server.version))
      .filter((file) => file.fileName.toLowerCase().endsWith(".jar"))
      .sort(compareCurseForgeFiles)
      .find((file) => Boolean(file.downloadUrl));

    if (!selectedFile?.downloadUrl) {
      throw new Error(`Aucun fichier CurseForge compatible avec Paper ${server.version}.`);
    }

    const installedPath = await this.installDownloadedFile(server, {
      provider: "curseforge",
      projectKey: request.projectId,
      versionKey: String(selectedFile.id),
      downloadUrl: selectedFile.downloadUrl,
      fileName: selectedFile.fileName,
      headers: {
        "x-api-key": apiKey,
      },
    });

    return {
      provider: "curseforge",
      pluginName: request.slug,
      fileName: selectedFile.fileName,
      targetPath: installedPath,
    };
  }

  private async installFromHangar(server: PersistedServerRecord, request: PluginInstallRequest): Promise<PluginInstallResult> {
    const versions = await fetchJson<HangarVersionResponse>(
      `${HANGAR_API_ROOT}/projects/${encodeURIComponent(request.author)}/${encodeURIComponent(request.slug)}/versions?limit=30&offset=0`,
    );
    const selectedVersion = [...versions.result]
      .sort(compareHangarVersions)
      .find((version) => {
        const download = resolveHangarDownload(version);
        if (!download) {
          return false;
        }
        const requirements = extractHangarPaperRequirements(version);
        return requirements.length === 0 || requirements.some((requirement) => matchesHangarVersion(requirement, server.version));
      }) ?? [...versions.result].sort(compareHangarVersions).find((version) => Boolean(resolveHangarDownload(version)));

    if (!selectedVersion) {
      throw new Error(`Aucune version Hangar installable n'a ete trouvee pour ${request.slug}.`);
    }

    const download = resolveHangarDownload(selectedVersion);
    if (!download) {
      throw new Error("Cette version Hangar n'expose pas de telechargement Paper.");
    }

    const fileName = inferFileNameFromUrl(download)
      ?? safeFileName(`${request.slug}-${selectedVersion.name ?? "latest"}.jar`);
    const installedPath = await this.installDownloadedFile(server, {
      provider: "hangar",
      projectKey: `${request.author}-${request.slug}`,
      versionKey: selectedVersion.name ?? "latest",
      downloadUrl: download,
      fileName,
    });

    return {
      provider: "hangar",
      pluginName: request.slug,
      fileName,
      targetPath: installedPath,
    };
  }

  private async installDownloadedFile(
    server: PersistedServerRecord,
    payload: {
      provider: PluginInstallRequest["provider"];
      projectKey: string;
      versionKey: string;
      downloadUrl: string;
      fileName: string;
      headers?: Record<string, string>;
    },
  ): Promise<string> {
    const pluginsDir = getPaperPluginsDirectory(server);
    const cacheFile = path.join(
      this.cacheDir,
      "plugins",
      payload.provider,
      safeFileName(payload.projectKey),
      safeFileName(payload.versionKey),
      safeFileName(payload.fileName),
    );

    await downloadFile(payload.downloadUrl, cacheFile, payload.headers);
    const targetPath = path.join(pluginsDir, safeFileName(payload.fileName));
    await copyFile(cacheFile, targetPath);
    return targetPath;
  }

  private requireCurseForgeApiKey(): string {
    const apiKey = this.getCurseForgeApiKey();
    if (!apiKey) {
      throw new Error("CurseForge exige une cle API. Definis VMC_CURSEFORGE_API_KEY pour activer cette source.");
    }
    return apiKey;
  }
}

export function getPaperPluginsDirectory(server: PersistedServerRecord): string {
  return path.join(server.rootDir, "paper", "plugins");
}

function compareModrinthVersions(left: ModrinthVersion, right: ModrinthVersion): number {
  const channelScore = (value: ModrinthVersion["version_type"]) => {
    switch (value) {
      case "release":
        return 3;
      case "beta":
        return 2;
      default:
        return 1;
    }
  };
  return (
    channelScore(right.version_type) - channelScore(left.version_type)
    || Number(right.featured) - Number(left.featured)
    || compareNullableDates(right.date_published, left.date_published)
  );
}

function compareCurseForgeFiles(left: CurseForgeFile, right: CurseForgeFile): number {
  return (left.releaseType - right.releaseType) || compareNullableDates(right.fileDate, left.fileDate);
}

function compareHangarVersions(left: HangarVersion, right: HangarVersion): number {
  const channelScore = (value?: string) => {
    switch ((value ?? "").toLowerCase()) {
      case "release":
        return 3;
      case "snapshot":
        return 2;
      case "alpha":
        return 1;
      default:
        return 0;
    }
  };
  return (
    channelScore(right.channel?.name) - channelScore(left.channel?.name)
    || compareNullableDates(right.createdAt, left.createdAt)
  );
}

function selectJarFile(files: ModrinthVersion["files"]) {
  return files.find((file) => file.primary && file.filename.toLowerCase().endsWith(".jar"))
    ?? files.find((file) => file.filename.toLowerCase().endsWith(".jar"))
    ?? null;
}

function resolveHangarDownload(version: HangarVersion): string | null {
  const paperDownload = version.downloads?.PAPER;
  if (!paperDownload) {
    return null;
  }
  return paperDownload.downloadUrl ?? paperDownload.externalUrl ?? null;
}

function extractHangarPaperRequirements(version: HangarVersion): string[] {
  return extractVersionStrings(version.platformDependencies?.PAPER)
    .concat(extractVersionStrings(version.platforms?.PAPER));
}

function extractVersionStrings(value: unknown): string[] {
  if (!value) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractVersionStrings(entry));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.platformVersion,
      record.platformVersions,
      record.version,
      record.versions,
      record.value,
      record.name,
    ];
    return candidates.flatMap((candidate) => extractVersionStrings(candidate));
  }
  return [];
}

function matchesHangarVersion(requirement: string, minecraftVersion: string): boolean {
  return requirement
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => matchesHangarVersionPart(entry, minecraftVersion));
}

function matchesHangarVersionPart(requirement: string, minecraftVersion: string): boolean {
  const normalized = requirement.toLowerCase();
  const current = parseVersion(minecraftVersion);
  if (!current) {
    return false;
  }

  if (normalized.endsWith(".x")) {
    return minecraftVersion.startsWith(requirement.slice(0, -1));
  }

  if (normalized.includes("-")) {
    const [min, max] = requirement.split("-", 2).map((value) => parseVersion(value.trim()));
    if (!min || !max) {
      return false;
    }
    return compareVersionArrays(current, min) >= 0 && compareVersionArrays(current, max) <= 0;
  }

  const exact = parseVersion(requirement);
  return exact ? compareVersionArrays(current, exact) === 0 : false;
}

function parseVersion(value: string): number[] | null {
  const segments = value.split(".").map((segment) => Number.parseInt(segment, 10));
  return segments.every((segment) => Number.isFinite(segment)) ? segments : null;
}

function compareVersionArrays(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }
  return 0;
}

function compareNullableDates(left: string | null | undefined, right: string | null | undefined): number {
  return (Date.parse(left ?? "") || 0) - (Date.parse(right ?? "") || 0);
}

function inferFileNameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const fileName = pathname.split("/").filter(Boolean).pop();
    return fileName ? decodeURIComponent(fileName) : null;
  } catch {
    return null;
  }
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-");
}

async function fetchJson<T>(url: string, extraHeaders?: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": OPENVMC_USER_AGENT,
      Accept: "application/json",
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    throw new Error(`Requete plugin en echec (${response.status}) sur ${url}.`);
  }

  return response.json() as Promise<T>;
}
