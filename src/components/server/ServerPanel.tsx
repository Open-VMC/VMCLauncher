import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { useI18n } from "../../i18n";
import type { LauncherSnapshot, PluginInstallRequest, PluginSearchRequest, PluginSearchResult, ServerDetails, ServerRecord, ServerRoute } from "../../types";
import { Btn, MetricCard } from "../ui/Primitives";
import { ServerNavLink } from "../ui/SidebarLinks";

function IpCard({ localIp, port }: { localIp: string; port: number }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const addr = `${localIp}:${port}`;
  const copy = () => {
    void navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>IP</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text)", fontFamily: "JetBrains Mono, monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addr}</span>
        <button onClick={copy} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "var(--green-light)" : "var(--text-muted)", flexShrink: 0, display: "flex" }} title={t.copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}
import { ConsoleView } from "./ConsoleView";
import { FilesView } from "./FilesView";
import { PluginsView } from "./PluginsView";
import { ServerSettingsView } from "./ServerSettingsView";
import { getAddonMode, getServerKindLabel, formatMb, formatUptime } from "../../utils/server";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
  exit: { opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.2 } },
};

export function ServerPanel({ details, snapshot, route, onNavigate, onStart, onStop, onCommand, onSearchPlugins, onInstallPlugin, onReloadDetails, withFeedback, setFeedback }: {
  details: ServerDetails;
  snapshot: LauncherSnapshot;
  route: ServerRoute;
  onNavigate: (r: ServerRoute) => void;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onCommand: (cmd: string) => Promise<void>;
  onSearchPlugins: (payload: PluginSearchRequest) => Promise<PluginSearchResult[]>;
  onInstallPlugin: (payload: PluginInstallRequest) => Promise<void>;
  onReloadDetails: () => Promise<void>;
  withFeedback: (work: () => Promise<void>) => Promise<void>;
  setFeedback: (m: string | null) => void;
}) {
  const { t } = useI18n();
  const status = details.server.status;
  const isRunning = status === "running";
  const isStarting = status === "starting";
  const isStopping = status === "stopping";
  const isActive = isRunning || isStarting || isStopping;
  const addonMode = getAddonMode(details.server.kind);
  const isPlugins = addonMode === "plugins";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside style={{ width: 220, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div data-tauri-drag-region style={{ padding: "38px 16px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-heading)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{details.server.displayName}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{getServerKindLabel(details.server.kind)}</div>
        </div>
        <nav style={{ flex: 1, padding: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
          <ServerNavLink active={route === "console"} label={t.serverNav.console} onClick={() => onNavigate("console")} />
          <ServerNavLink active={route === "files"} label={t.serverNav.files} onClick={() => onNavigate("files")} />
          <ServerNavLink active={route === "plugins"} label={isPlugins ? t.serverNav.plugins : t.serverNav.mods} onClick={() => onNavigate("plugins")} />
          <ServerNavLink active={route === "settings"} label={t.serverNav.serverSettings} onClick={() => onNavigate("settings")} />
        </nav>
      </aside>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
          <div data-tauri-drag-region style={{ position: "absolute", top: 0, left: 0, right: 0, height: 38, zIndex: 10 }} />
          <AnimatePresence mode="wait">
            <motion.div key={route} initial="hidden" animate="show" exit="exit" variants={fadeUp} style={{ height: "100%" }}>
              {route === "console" && <ConsoleView details={details} onCommand={onCommand} />}
              {route === "files" && <FilesView details={details} onReloadDetails={onReloadDetails} withFeedback={withFeedback} setFeedback={setFeedback} />}
              {route === "plugins" && <PluginsView details={details} onSearch={onSearchPlugins} onInstall={onInstallPlugin} onReloadDetails={onReloadDetails} />}
              {route === "settings" && <ServerSettingsView details={details} snapshot={snapshot} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside style={{ width: 180, background: "var(--bg-sidebar)", borderLeft: "1px solid var(--border)", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0, overflowY: "auto" }}>
          <Btn
            variant={isRunning || isStopping ? "danger" : "primary"}
            onClick={() => void (isRunning ? onStop() : isActive ? undefined : onStart())}
            disabled={isStarting || isStopping}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {isStopping ? t.status.stopping : isStarting ? t.status.starting : isRunning ? t.stop : t.launch}
          </Btn>
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          <MetricCard label={t.stats.uptime} value={formatUptime(details.stats.uptimeSeconds)} />
          <MetricCard label={t.stats.cpu} value={`${details.stats.cpuPercent.toFixed(1)}% / ${details.stats.cpuLimitPercent.toFixed(0)}%`} />
          <MetricCard label={t.stats.ram} value={`${formatMb(details.stats.ramUsedMb)} / ${formatMb(details.stats.ramLimitMb)}`} />
          <MetricCard label={t.stats.storage} value={formatMb(details.stats.storageMb)} />
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          <IpCard localIp={details.localIp} port={details.paperPort} />
        </aside>
      </div>
    </div>
  );
}
