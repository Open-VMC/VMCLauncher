import type { ServerRecord, LauncherRoute, ServerRoute } from "../types";

export const SERVER_KIND_LABEL: Record<ServerRecord["kind"], string> = {
  vanilla: "Vanilla",
  papermc: "Paper",
  forge: "Forge",
  fabric: "Fabric",
  neoforge: "NeoForge",
  pumpkin: "Pumpkin",
};

export function getServerKindLabel(kind: ServerRecord["kind"]): string {
  return SERVER_KIND_LABEL[kind] ?? kind;
}

export function getAddonMode(kind: ServerRecord["kind"]): "plugins" | "mods" | "unsupported" {
  if (kind === "papermc" || kind === "pumpkin") return "plugins";
  if (kind === "fabric" || kind === "forge" || kind === "neoforge") return "mods";
  return "unsupported";
}

export type ParsedRoute =
  | { kind: "launcher"; route: LauncherRoute }
  | { kind: "server"; serverUuid: string; route: ServerRoute };

export function parseHash(hash: string): ParsedRoute {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "server" && parts[1]) {
    return { kind: "server", serverUuid: parts[1], route: (parts[2] as ServerRoute) ?? "console" };
  }
  const r = (parts[0] as LauncherRoute) || "home";
  if (r !== "home" && r !== "servers" && r !== "settings") return { kind: "launcher", route: "home" };
  return { kind: "launcher", route: r };
}

export function formatMb(value: number): string {
  return value >= 1024 ? `${(value / 1024).toFixed(1)} GiB` : `${value.toFixed(0)} MiB`;
}

export function formatUptime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  const hours = Math.floor(mins / 60);
  if (hours === 0) return `${mins}min ${secs}s`;
  return `${hours}h ${mins % 60}min`;
}
