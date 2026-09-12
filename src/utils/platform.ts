import { invoke } from "@tauri-apps/api/core";

interface PlatformInfo {
  arch: string;
  os: string;
  macosMajor: number;
  cpuCores: number;
}

function iconFromInfo(info: PlatformInfo): string {
  if (info.os === "windows") return "/icon-windows.png";
  if (info.arch === "aarch64" || info.macosMajor >= 26) return "/icon-macos-liquid-glass.png";
  return "/icon-macos.png";
}

let cachedInfo: PlatformInfo | null = null;

async function getPlatformInfo(): Promise<PlatformInfo> {
  if (!cachedInfo) cachedInfo = await invoke<PlatformInfo>("get_platform_info");
  return cachedInfo;
}

export async function loadAppIconSrc(): Promise<string> {
  return iconFromInfo(await getPlatformInfo());
}

export async function getCpuCores(): Promise<number> {
  return (await getPlatformInfo()).cpuCores;
}
