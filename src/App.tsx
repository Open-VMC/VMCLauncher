import { useEffect, useCallback, useState, useRef } from "react";
import { getVersion } from "@tauri-apps/api/app";

import { AnimatePresence, motion } from "framer-motion";
import { Home, Server, Settings, Pencil, Moon, Sun, Monitor } from "lucide-react";
import type {
  CreateServerPayload,
  InstallationProgress,
  LauncherSnapshot,
  PluginInstallRequest,
  PluginSearchRequest,
  PluginSearchResult,
  ServerDetails,
  ServerRecord,
  UpdateServerSettingsPayload,
} from "./types";
import { api } from "./lib/api";
import { useI18n } from "./i18n";
import { useTheme } from "./hooks/useTheme";
import { parseHash } from "./utils/server";
import { FeedbackBar } from "./components/ui/FeedbackBar";
import { SidebarLink } from "./components/ui/SidebarLinks";
import { HomePage } from "./components/pages/HomePage";
import { ServersPage } from "./components/pages/ServersPage";
import { SettingsPage } from "./components/pages/SettingsPage";
import { CreateServerDialog } from "./components/dialogs/CreateServerDialog";
import { RenameServerDialog } from "./components/dialogs/RenameServerDialog";
import { ServerPanel } from "./components/server/ServerPanel";

const HERO_IMAGES = [
  "/images/hero-mountains.jpeg",
  "/images/hero-ocean.jpeg",
  "/images/hero-cherry.jpeg",
];

const fadeIn = {
  hidden: { opacity: 0, scale: 0.98 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.2 } },
};

function LoadingScreen({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", gap: 28 }}
    >
      <motion.img
        src="/logo.svg"
        alt="OpenVMC"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
        style={{ width: 160, height: "auto" }}
      />
      <div style={{ width: 200, height: 6, borderRadius: 999, background: "var(--hover-medium)", overflow: "hidden", position: "relative" }}>
        <motion.div
          animate={{
            left:  ["-8px",  "50px", "200px"],
            width: ["8px",  "100px",  "8px"],
          }}
          transition={{
            repeat: Infinity, duration: 1.1,
            times: [0, 0.5, 1],
            ease: [0.4, 0, 0.6, 1],
          }}
          style={{ position: "absolute", top: 0, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--green) 0%, var(--green-light) 100%)" }}
        />
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.12em", marginTop: -12, display: "flex" }}
      >
        {label.split("").map((char, i) => (
          <motion.span
            key={i}
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5, delay: 0.3 + i * 0.07, ease: "easeInOut" }}
          >
            {char === " " ? " " : char}
          </motion.span>
        ))}
      </motion.div>
    </motion.div>
  );
}

export function App() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [details, setDetails] = useState<ServerDetails | null>(null);
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [installationProgress, setInstallationProgress] = useState<InstallationProgress | null>(null);
  const [creating, setCreating] = useState(false);
  const [renamingServer, setRenamingServer] = useState<ServerRecord | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [minDelayElapsed, setMinDelayElapsed] = useState(() => parseHash(window.location.hash).kind === "server");
  const bootedRef = useRef(false);
  const prevStatusRef = useRef<Record<string, string>>({});
  const detailsCacheRef = useRef<Record<string, ServerDetails>>({});

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const initialRoute = parseHash(window.location.hash);

    const promises: Promise<void>[] = [
      api.getSnapshot().then((snap) => {
        setSnapshot(snap);
        snap.servers.forEach((server) => {
          void api.getServerDetails(server.serverUuid)
            .then((d) => {
              detailsCacheRef.current[server.serverUuid] = d;
              if (initialRoute.kind === "server" && initialRoute.serverUuid === server.serverUuid) {
                setDetails(d);
              }
            })
            .catch(() => {});
        });
      }).catch((err: unknown) => {
        setBootError(err instanceof Error ? err.message : String(err));
      }),

      getVersion().then(setAppVersion).catch(() => {}),
    ];

    HERO_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    void Promise.all(promises);

    if (initialRoute.kind === "server") {
      void api.getCachedServerDetails(initialRoute.serverUuid).then((d) => {
        if (d) setDetails(d);
      }).catch(() => {});
    } else {
      setTimeout(() => setMinDelayElapsed(true), 5000);
    }

    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const unsub = api.onEvent((event) => {
      if (event.type === "installation-progress") {
        setInstallationProgress(event.progress ?? null);
      }
      if (event.type === "java-upgraded" && event.serverUuid) {
        void api.startServer(event.serverUuid).catch(() => {});
      }
      if (event.type === "server-updated") {
        const uuid = route.kind === "server" ? (route as { serverUuid: string }).serverUuid : null;
        if (uuid) {
          void api.getServerStats(uuid).then((live) => {
            setDetails((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                server: { ...prev.server, status: live.status },
                stats: { ...prev.stats, uptimeSeconds: live.stats.uptimeSeconds, cpuPercent: live.stats.cpuPercent, ramUsedMb: live.stats.ramUsedMb },
              };
            });
          }).catch(() => {});
        }
        void refreshSnapshot().then(() => {
          if (!event.serverUuid || !("Notification" in window) || Notification.permission !== "granted") return;
          setSnapshot((snap) => {
            if (!snap) return snap;
            const server = snap.servers.find((s) => s.serverUuid === event.serverUuid);
            if (!server) return snap;
            const prev = prevStatusRef.current[server.serverUuid];
            const curr = server.status;
            if (prev && prev !== curr && (curr === "running" || curr === "stopped" || curr === "error")) {
              api.getLauncherSettings().then((ls) => {
                if (!ls.notificationsEnabled) return;
                const label = curr === "running" ? t.status.running : curr === "error" ? t.status.error : t.status.stopped;
                new Notification("VMC Launcher", { body: `${server.displayName} — ${label}` });
              }).catch(() => {});
            }
            prevStatusRef.current[server.serverUuid] = curr;
            return snap;
          });
        });
      } else if (event.type === "state-changed") {
        void refreshSnapshot();
        if (route.kind === "server") void refreshServer((route as { serverUuid: string }).serverUuid);
      }
    });
    return () => unsub();
  }, [route]);

  // Refetch when window becomes visible again (e.g. restored from system tray)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshSnapshot();
        if (route.kind === "server") {
          void refreshServer((route as { serverUuid: string }).serverUuid);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [route]);

  useEffect(() => {
    if (route.kind === "server") {
      const cached = detailsCacheRef.current[route.serverUuid];
      if (cached) setDetails(cached);
      void refreshServer(route.serverUuid);
      // Only poll volatile stats (CPU/RAM/status); static values (storage, limits) come from getServerDetails
      const poll = setInterval(() => {
        void api.getServerStats(route.serverUuid).then((live) => {
          setDetails((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              server: { ...prev.server, status: live.status },
              stats: {
                ...prev.stats,
                uptimeSeconds: live.stats.uptimeSeconds,
                cpuPercent: live.stats.cpuPercent,
                ramUsedMb: live.stats.ramUsedMb,
              },
            };
          });
        }).catch(() => {});
      }, 3000);
      return () => clearInterval(poll);
    } else {
      setDetails(null);
      return undefined;
    }
  }, [route.kind === "server" ? (route as { serverUuid: string }).serverUuid : null]);

  async function refreshSnapshot() {
    try { setSnapshot(await api.getSnapshot()); }
    catch (err: unknown) { setBootError(err instanceof Error ? err.message : String(err)); }
  }

  async function refreshServer(id: string) {
    try {
      const d = await api.getServerDetails(id);
      detailsCacheRef.current[id] = d;
      setDetails(d);
    }
    catch { /* silent: polling may fail transiently */ }
  }

  const withFeedback = useCallback(async (work: () => Promise<void>) => {
    setBusy(true); setFeedback(null);
    try { await work(); }
    catch (err) { setFeedback(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }, []);

  async function handleCreateServer(payload: CreateServerPayload) {
    setCreating(true); setInstallationProgress(null);
    try {
      await withFeedback(async () => {
        const server = await api.createServer(payload);
        await refreshSnapshot();
        setCreateOpen(false); setInstallationProgress(null);
        await api.openServerWindow(server.serverUuid);
      });
    } finally { setCreating(false); }
  }

  async function handleLaunchServer(id: string) {
    await withFeedback(async () => {
      await api.openServerWindow(id); await api.startServer(id); await refreshSnapshot();
      if (route.kind === "server" && (route as { serverUuid: string }).serverUuid === id) await refreshServer(id);
    });
  }

  async function handleOpenServer(id: string) { await withFeedback(() => api.openServerWindow(id)); }

  async function handleStopServer(id: string) {
    await withFeedback(async () => {
      await api.stopServer(id); await refreshSnapshot();
      if (route.kind === "server") await refreshServer(id);
    });
  }

  async function handleConsoleCommand(id: string, cmd: string) {
    await withFeedback(async () => { await api.sendConsoleCommand(id, cmd); await refreshServer(id); });
  }

  async function handleSearchPlugins(payload: PluginSearchRequest): Promise<PluginSearchResult[]> {
    return api.searchPlugins(payload);
  }

  async function handleInstallPlugin(payload: PluginInstallRequest) {
    await withFeedback(async () => { await api.installPlugin(payload); await refreshServer(payload.serverUuid); });
  }

  async function handleRenameServer(serverUuid: string) {
    const server = snapshot?.servers.find((s) => s.serverUuid === serverUuid);
    if (server) setRenamingServer(server);
  }

  async function performRename(serverUuid: string, newName: string) {
    await withFeedback(async () => { await api.renameServer(serverUuid, newName); await refreshSnapshot(); setRenamingServer(null); });
  }

  async function handleDeleteServer(serverUuid: string) {
    if (!window.confirm(t.files.deleteServerConfirm)) return;
    await withFeedback(async () => { await api.deleteServer(serverUuid); await refreshSnapshot(); });
  }

  if (bootError) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "#1a0505", color: "#ff8888", padding: 40, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>{t.bootError.title}</div>
          <code style={{ background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 4, display: "block", marginBottom: 16 }}>{bootError}</code>
          <button onClick={() => window.location.reload()} style={{ background: "#ff8888", color: "#1a0505", border: "none", padding: "10px 20px", borderRadius: 4, fontWeight: 800, cursor: "pointer" }}>{t.bootError.retry}</button>
        </div>
      </div>
    );
  }

  if (!snapshot || !minDelayElapsed) {
    return <LoadingScreen label={t.loading} />;
  }

  if (route.kind === "server") {
    const serverDetails = details ?? detailsCacheRef.current[route.serverUuid] ?? null;
    if (!serverDetails) {
      return <LoadingScreen label={t.loading} />;
    }
    return (
      <>
        {feedback && <FeedbackBar message={feedback} />}
        <ServerPanel
          details={serverDetails}
          snapshot={snapshot}
          route={route.route}
          onNavigate={(r) => { window.location.hash = `#/server/${serverDetails.server.serverUuid}/${r}`; }}
          onStart={() => handleLaunchServer(serverDetails.server.serverUuid)}
          onStop={() => handleStopServer(serverDetails.server.serverUuid)}
          onCommand={(cmd) => handleConsoleCommand(serverDetails.server.serverUuid, cmd)}
          onSearchPlugins={handleSearchPlugins}
          onInstallPlugin={handleInstallPlugin}
          onReloadDetails={() => refreshServer(serverDetails.server.serverUuid)}
          withFeedback={withFeedback}
          setFeedback={setFeedback}
        />
      </>
    );
  }

  return (
    <>
      {feedback && <FeedbackBar message={feedback} />}
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <aside style={{ width: 220, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div data-tauri-drag-region style={{ padding: "38px 16px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <img src="/logo.svg" alt="OpenVMC" style={{ width: 52, height: "auto", flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-heading)" }}>VMC Launcher</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>by OpenVMC</div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: "8px", display: "flex", flexDirection: "column", gap: 2 }}>
            <SidebarLink active={route.kind === "launcher" && route.route === "home"} href="#/home" label={t.nav.home} icon={<Home size={16} />} />
            <SidebarLink active={false} href="#" label={t.nav.editor} icon={<Pencil size={16} />} suffix={t.soon} disabled />
            <SidebarLink active={route.kind === "launcher" && route.route === "servers"} href="#/servers" label={t.nav.servers} icon={<Server size={16} />} />
          </nav>
          <div style={{ padding: "8px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 }}>
            <SidebarLink active={route.kind === "launcher" && route.route === "settings"} href="#/settings" label={t.nav.settings} icon={<Settings size={16} />} />
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "auto" : "dark")}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 4, fontSize: 14, color: "var(--text-soft)", background: "transparent", border: "none", cursor: "pointer", transition: "background 0.15s", width: "100%" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-subtle)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ opacity: 0.7, display: "inline-flex", alignItems: "center" }}>
                {theme === "dark" ? <Moon size={16} /> : theme === "light" ? <Sun size={16} /> : <Monitor size={16} />}
              </span>
              <span style={{ flex: 1, textAlign: "left" }}>
                {theme === "dark" ? t.settingsPage.themeDark : theme === "light" ? t.settingsPage.themeLight : t.settingsPage.themeAuto}
              </span>
            </button>
          </div>
        </aside>

        <main style={{ flex: 1, overflow: "hidden", background: "var(--bg)", position: "relative" }}>
          <div data-tauri-drag-region style={{ position: "absolute", top: 0, left: 0, right: 0, height: 38, zIndex: 10 }} />
          <AnimatePresence mode="wait">
            {route.kind === "launcher" && route.route === "home" && (
              <motion.div key="home" initial="hidden" animate="show" exit="exit" variants={fadeIn} style={{ height: "100%" }}>
                <HomePage snapshot={snapshot} onLaunch={handleLaunchServer} onOpen={handleOpenServer} onCreate={() => setCreateOpen(true)} onRename={handleRenameServer} onDelete={handleDeleteServer} />
              </motion.div>
            )}
            {route.kind === "launcher" && route.route === "servers" && (
              <motion.div key="servers" initial="hidden" animate="show" exit="exit" variants={fadeIn} style={{ height: "100%" }}>
                <ServersPage snapshot={snapshot} onLaunch={handleLaunchServer} onOpen={handleOpenServer} onCreate={() => setCreateOpen(true)} onRename={handleRenameServer} onDelete={handleDeleteServer} />
              </motion.div>
            )}
            {route.kind === "launcher" && route.route === "settings" && (
              <motion.div key="settings" initial="hidden" animate="show" exit="exit" variants={fadeIn} style={{ height: "100%" }}>
                <SettingsPage snapshot={snapshot} theme={theme} setTheme={setTheme} appVersion={appVersion} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {createOpen && <CreateServerDialog snapshot={snapshot} onClose={() => { if (!creating) setCreateOpen(false); }} onCreate={handleCreateServer} busy={creating} installationProgress={installationProgress} />}
        {renamingServer && <RenameServerDialog server={renamingServer} onClose={() => setRenamingServer(null)} onRename={performRename} />}
      </AnimatePresence>
    </>
  );
}
