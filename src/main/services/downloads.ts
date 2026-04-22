import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const PAPERMC_API_ROOT = "https://fill.papermc.io/v3";
const ADOPTIUM_API_ROOT = "https://api.adoptium.net/v3";
export const OPENVMC_USER_AGENT = "OpenVMC-Launcher/0.4.0";

interface FillProjectResponse {
  versions: Record<string, string[]>;
}

interface FillBuildResponse {
  id: number;
  channel: string;
  downloads: Record<string, { name: string; url: string }>;
}

export interface DownloadArtifact {
  version: string;
  buildId?: number;
  fileName: string;
  url: string;
}

export async function resolvePaperArtifact(version: string): Promise<DownloadArtifact> {
  const builds = await fetchJson<FillBuildResponse[]>(
    `${PAPERMC_API_ROOT}/projects/paper/versions/${encodeURIComponent(version)}/builds`,
  );
  const stableBuild = builds.find((build) => build.channel === "STABLE" && build.downloads["server:default"]);
  if (!stableBuild) {
    throw new Error(`Aucun build stable Paper n'est disponible pour ${version}.`);
  }

  return {
    version,
    buildId: stableBuild.id,
    fileName: stableBuild.downloads["server:default"].name,
    url: stableBuild.downloads["server:default"].url,
  };
}

export async function resolveVelocityArtifact(): Promise<DownloadArtifact> {
  const project = await fetchJson<FillProjectResponse>(`${PAPERMC_API_ROOT}/projects/velocity`);
  const latestVersion = Object.values(project.versions).flat()[0];
  if (!latestVersion) {
    throw new Error("Impossible de determiner la derniere version stable de Velocity.");
  }

  const builds = await fetchJson<FillBuildResponse[]>(
    `${PAPERMC_API_ROOT}/projects/velocity/versions/${encodeURIComponent(latestVersion)}/builds`,
  );
  const stableBuild = builds.find((build) => build.channel === "STABLE" && build.downloads["server:default"]);
  if (!stableBuild) {
    throw new Error(`Aucun build stable Velocity n'est disponible pour ${latestVersion}.`);
  }

  return {
    version: latestVersion,
    buildId: stableBuild.id,
    fileName: stableBuild.downloads["server:default"].name,
    url: stableBuild.downloads["server:default"].url,
  };
}

export function resolveTemurinBinaryUrl(platform: NodeJS.Platform, arch: string, imageType: "jre" | "jdk"): string {
  return `${ADOPTIUM_API_ROOT}/binary/latest/21/ga/${mapPlatform(platform)}/${mapArch(arch)}/${imageType}/hotspot/normal/eclipse?project=jdk`;
}

export async function downloadFile(
  url: string,
  destination: string,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });

  try {
    const existing = await stat(destination);
    if (existing.isFile() && existing.size > 0) {
      return;
    }
  } catch {
    // Ignore missing file and continue download.
  }

  const temporaryFile = `${destination}.download`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": OPENVMC_USER_AGENT,
      ...extraHeaders,
    },
    redirect: "follow",
  });

  if (!response.ok || !response.body) {
    throw new Error(`Echec du telechargement depuis ${url} (${response.status}).`);
  }

  await pipeline(response.body, createWriteStream(temporaryFile));
  await rename(temporaryFile, destination);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": OPENVMC_USER_AGENT,
      Accept: "application/json",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Requete API en echec (${response.status}) pour ${url}.`);
  }
  return response.json() as Promise<T>;
}

function mapPlatform(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return "mac";
    case "win32":
      return "windows";
    default:
      return "linux";
  }
}

function mapArch(arch: string): string {
  switch (arch) {
    case "arm64":
      return "aarch64";
    case "x64":
      return "x64";
    default:
      throw new Error(`Architecture Java non supportee: ${arch}`);
  }
}
