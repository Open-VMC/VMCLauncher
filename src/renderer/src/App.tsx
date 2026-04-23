import {
  type ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import Editor from "react-simple-code-editor";
import Prism from "./lib/prism";




import type {
  AuthPayload,
  CreateServerPayload,
  LauncherRoute,
  LauncherSnapshot,
  PluginInstallRequest,
  PluginProvider,
  PluginSearchRequest,
  PluginSearchResult,
  NetworkMode,
  ServerDetails,
  ServerRecord,
  ServerRoute,
  UpdateServerSettingsPayload,
  UpdateVmcSettingsPayload,
  FileEntry,
} from "@shared/contracts";
import { useI18n, LOCALES, type LocaleCode } from "./i18n";
import { ThreeHero } from "./components/scene/ThreeHero";
import {
  Btn,
  Input,
  Select,
  FormField,
  MetricCard,
  StatusPill,
} from "./components/ui/Primitives";

// ─── Framer variants ──────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// ─── Route types ──────────────────────────────────────────────────────────────
type ParsedRoute =
  | { kind: "launcher"; route: LauncherRoute }
  | { kind: "server"; serverUuid: string; route: ServerRoute };

// ─── Shared UI primitives ─────────────────────────────────────────────────────
// ─── Sidebar ──────────────────────────────────────────────────────────────────
function SidebarLink({
  active,
  href,
  label,
  icon,
  suffix,
  disabled,
}: {
  active: boolean;
  href: string;
  label: string;
  icon?: ReactNode;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <a
      href={disabled ? undefined : href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 4,
        fontWeight: active ? 600 : 400,
        fontSize: 14,
        color: active ? "#fff" : "var(--text-soft)",
        background: active ? "rgba(76,158,63,0.18)" : "transparent",
        borderLeft: active ? "3px solid var(--green)" : "3px solid transparent",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.15s, color 0.15s",
        textDecoration: "none",
        userSelect: "none",
      }}
      onMouseEnter={(e) => { if (!active && !disabled) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={(e) => { if (!active && !disabled) (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
    >
      {icon && <span style={{ opacity: 0.7, display: "inline-flex", alignItems: "center" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {suffix && (
        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600 }}>
          {suffix}
        </span>
      )}
    </a>
  );
}

// ─── Server nav link ──────────────────────────────────────────────────────────
function ServerNavLink({ active, label, suffix, onClick }: { active: boolean; label: string; suffix?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 16px",
        background: active ? "rgba(76,158,63,0.15)" : "transparent",
        borderLeft: active ? "3px solid var(--green)" : "3px solid transparent",
        border: "none",
        color: active ? "#fff" : "var(--text-soft)",
        fontWeight: active ? 600 : 400,
        fontSize: 14,
        cursor: "pointer",
        borderRadius: 4,
        textAlign: "left",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {suffix && (
        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600 }}>
          {suffix}
        </span>
      )}
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
import { House, Cpu, Gear, Pencil, ThreeDots, Folder, FileEarmarkText, Trash } from 'react-bootstrap-icons';

const IcoHome = () => <House size={16} />;
const IcoServers = () => <Cpu size={16} />;
const IcoSettings = () => <Gear size={16} />;
const IcoEdit = () => <Pencil size={16} />;
const IcoDotsVertical = () => <ThreeDots size={18} />;
const IcoFolder = () => <Folder size={16} />;
const IcoFile = () => <FileEarmarkText size={16} />;
const IcoTrash = ({ size = 16 }: { size?: number }) => <Trash size={size} />;

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({
  snapshot,
  onAuth,
  busy,
  feedback,
}: {
  snapshot: LauncherSnapshot;
  onAuth: (payload: AuthPayload, mode: "login" | "register") => Promise<void>;
  busy: boolean;
  feedback: string | null;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg)" }}>
      {/* Left hero */}
      <div style={{
        flex: "1 1 55%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 64px",
        background: "linear-gradient(135deg, #1a1d23 0%, #1d2026 100%)",
        borderRight: "1px solid var(--border)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background animation */}
        <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.6 }}>
          <ThreeHero />
        </div>

        {/* bg glow */}
        <div style={{ position: "absolute", top: -120, left: -120, width: 400, height: 400, background: "radial-gradient(circle, rgba(76,158,63,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.div variants={fadeUp} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "var(--green-light)", textTransform: "uppercase", marginBottom: 20 }}>
            OpenVMC Launcher
          </motion.div>
          <motion.h1 variants={fadeUp} style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 16px", color: "#fff" }}>
            {t.auth.heroTitle}
          </motion.h1>
          <motion.p variants={fadeUp} style={{ fontSize: 15, color: "var(--text-soft)", lineHeight: 1.7, maxWidth: 440, margin: "0 0 40px" }}>
            {t.auth.heroSubtitle}
          </motion.p>
          <motion.div variants={fadeUp} style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "16px 20px",
            maxWidth: 380,
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{t.auth.deviceLabel}</div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: "var(--green-light)", fontWeight: 500, marginBottom: 8 }}>
              {snapshot.deviceLock.deviceId}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.auth.deviceNote}</div>
          </motion.div>
        </motion.div>
      </div>

      {/* Right auth panel */}
      <div style={{ flex: "0 0 400px", display: "flex", flexDirection: "column", justifyContent: "center", padding: "48px 40px", background: "var(--bg-sidebar)" }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 28, color: "#fff" }}>OpenVMC</div>

        {/* Tab strip */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-card)", padding: 4, borderRadius: 6, marginBottom: 28 }}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1,
              padding: "7px 0",
              border: "none",
              borderRadius: 4,
              background: mode === m ? "var(--green)" : "transparent",
              color: mode === m ? "#fff" : "var(--text-soft)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
            }}>
              {m === "login" ? t.auth.login : t.auth.register}
            </button>
          ))}
        </div>

        {feedback && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{
            background: "rgba(192,57,43,0.18)",
            border: "1px solid rgba(192,57,43,0.4)",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 13,
            color: "#ffc4bf",
            marginBottom: 20,
          }}>
            {feedback}
          </motion.div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); void onAuth({ email, password, displayName }, mode); }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <AnimatePresence>
            {mode === "register" && (
              <motion.div key="dn" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <FormField label={t.auth.displayName}>
                  <Input value={displayName} onChange={setDisplayName} placeholder={t.auth.displayNamePlaceholder} />
                </FormField>
              </motion.div>
            )}
          </AnimatePresence>
          <FormField label={t.auth.email}>
            <Input value={email} onChange={setEmail} placeholder={t.auth.emailPlaceholder} />
          </FormField>
          <FormField label={t.auth.password}>
            <Input type="password" value={password} onChange={setPassword} placeholder={t.auth.passwordPlaceholder} />
          </FormField>
          <Btn variant="primary" type="submit" disabled={busy} style={{ marginTop: 4, justifyContent: "center", padding: "10px 0" }}>
            {busy ? t.auth.busy : (mode === "login" ? t.auth.loginCta : t.auth.registerCta)}
          </Btn>
        </form>
      </div>
    </div>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
function HomePage({
  snapshot,
  onLaunch,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: {
  snapshot: LauncherSnapshot;
  onLaunch: (id: string) => Promise<void>;
  onOpen: (id: string) => Promise<void>;
  onCreate: () => void;
  onRename: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Hero */}
      <div style={{ position: "relative", height: 380, flexShrink: 0, overflow: "hidden", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <ThreeHero />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 48px 60px", pointerEvents: "none", zIndex: 20 }}>
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.07 } } }}>
            <motion.div variants={fadeUp} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: "var(--green-light)", textTransform: "uppercase", marginBottom: 8 }}>
              OpenVMC Launcher
            </motion.div>
            <motion.h1 variants={fadeUp} style={{ fontSize: 48, fontWeight: 900, margin: 0, color: "#fff", letterSpacing: "-0.03em", textShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
              OpenVMC
            </motion.h1>
            <motion.p variants={fadeUp} style={{ fontSize: 14, color: "var(--text-soft)", margin: "8px 0 0", maxWidth: 340 }}>
              {t.home.heroTagline}
            </motion.p>
          </motion.div>
        </div>
      </div>

      {/* Servers list */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t.home.myServers}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-soft)" }}>
              {snapshot.servers.length === 0 ? t.home.emptyHint : t.home.activeHint}
            </p>
          </div>
          <Btn variant="outline" onClick={onCreate}>+ {t.home.newServer}</Btn>
        </div>

        {snapshot.servers.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : (
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {snapshot.servers.map((server) => (
              <motion.div key={server.serverUuid} variants={fadeUp}>
                <ServerRow server={server} onOpen={() => void onOpen(server.serverUuid)} onLaunch={() => void onLaunch(server.serverUuid)} onRename={() => void onRename(server.serverUuid)} onDelete={() => void onDelete(server.serverUuid)} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ServerRow({ server, onOpen, onLaunch, onRename, onDelete }: { server: ServerRecord; onOpen: () => void; onLaunch: () => void; onRename: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  const isActive = server.status === "running" || server.status === "starting";
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div
      onClick={onOpen}
      style={{
        position: "relative",
        zIndex: showMenu ? 50 : 1,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 18px",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)"; (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)"; }}
    >
      <div style={{ width: 36, height: 36, background: "rgba(76,158,63,0.15)", border: "1px solid rgba(76,158,63,0.25)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, fontWeight: 800, color: "var(--green-light)" }}>
        {server.displayName.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{server.displayName}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          {server.kind === "paper-vmc" ? "Paper + OpenVMC Proxy" : "Paper"} · {server.version}
        </div>
      </div>
      <StatusPill status={server.status} />
      <Btn
        variant={isActive ? "ghost" : "primary"}
        onClick={(e) => { (e as unknown as MouseEvent).stopPropagation?.(); onLaunch(); }}
        style={{ flexShrink: 0 }}
      >
        {isActive ? t.open : t.launch}
      </Btn>
      <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
        >
          <IcoDotsVertical />
        </button>
        <AnimatePresence>
        {showMenu && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -5 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }} 
            exit={{ opacity: 0, scale: 0.95, y: -5 }} 
            transition={{ duration: 0.1 }} 
            style={{ 
              position: "absolute", 
              top: 32, 
              right: 0, 
              background: "rgba(23, 25, 30, 0.98)", 
              backdropFilter: "blur(20px)", 
              border: "1px solid var(--border)", 
              borderRadius: "10px", 
              padding: "4px", 
              zIndex: 100, 
              minWidth: "140px", 
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)" 
            }}
          >
            <button onClick={() => { setShowMenu(false); onRename(); }} style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", color: "#eee", cursor: "pointer", borderRadius: "6px", fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "2px" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{t.files.rename}</button>
            <button onClick={() => { setShowMenu(false); onDelete(); }} style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", color: "#ff5f52", cursor: "pointer", borderRadius: "6px", fontSize: "13px", fontWeight: 500, display: "block" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,95,82,0.12)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{t.files.delete}</button>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Servers Page ─────────────────────────────────────────────────────────────
function ServersPage({ snapshot, onLaunch, onOpen, onCreate, onRename, onDelete }: { snapshot: LauncherSnapshot; onLaunch: (id: string) => Promise<void>; onOpen: (id: string) => Promise<void>; onCreate: () => void; onRename: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div style={{ padding: "32px", overflow: "auto", height: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t.servers.title}</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-soft)" }}>{t.servers.subtitle}</p>
      </div>
      <motion.div
        initial="hidden" animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}
      >
        {snapshot.servers.map((server) => (
          <motion.div key={server.serverUuid} variants={fadeUp}>
            <ServerCard server={server} onOpen={() => void onOpen(server.serverUuid)} onLaunch={() => void onLaunch(server.serverUuid)} onRename={() => void onRename(server.serverUuid)} onDelete={() => void onDelete(server.serverUuid)} />
          </motion.div>
        ))}
        <motion.div variants={fadeUp}>
          <NewServerCard onClick={onCreate} />
        </motion.div>
      </motion.div>
    </div>
  );
}

function ServerCard({ server, onOpen, onLaunch, onRename, onDelete }: { server: ServerRecord; onOpen: () => void; onLaunch: () => void; onRename: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  const isActive = server.status === "running" || server.status === "starting";
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div
      onClick={onOpen}
      style={{ position: "relative", zIndex: showMenu ? 50 : 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", transition: "border-color 0.15s, transform 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(76,158,63,0.4)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLDivElement).style.transform = ""; }}
    >
      <div style={{ position: "relative", zIndex: 20, height: 90, background: "linear-gradient(135deg, rgba(76,158,63,0.15) 0%, rgba(26,29,35,0) 100%)", borderTopLeftRadius: 8, borderTopRightRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 900, color: "rgba(76,158,63,0.3)" }}>
        {server.displayName.slice(0, 1).toUpperCase()}
        <div style={{ position: "absolute", top: 10, right: 10 }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "4px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; e.currentTarget.style.background = "transparent"; }}
          >
            <IcoDotsVertical />
          </button>
          <AnimatePresence>
          {showMenu && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -5 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: -5 }} 
              transition={{ duration: 0.1 }} 
              style={{ 
                position: "absolute", 
                top: 32, 
                right: 0, 
                background: "rgba(23, 25, 30, 0.98)", 
                backdropFilter: "blur(20px)", 
                border: "1px solid var(--border)", 
                borderRadius: "10px", 
                padding: "4px", 
                zIndex: 100, 
                minWidth: "140px", 
                boxShadow: "0 10px 30px rgba(0,0,0,0.6)" 
              }}
            >
              <button onClick={() => { setShowMenu(false); onRename(); }} style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", color: "#eee", cursor: "pointer", borderRadius: "6px", fontSize: "13px", fontWeight: 500, display: "block", marginBottom: "2px" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{t.files.rename}</button>
              <button onClick={() => { setShowMenu(false); onDelete(); }} style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", color: "#ff5f52", cursor: "pointer", borderRadius: "6px", fontSize: "13px", fontWeight: 500, display: "block" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,95,82,0.12)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{t.files.delete}</button>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{server.displayName}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>{server.kind === "paper-vmc" ? "Paper + OpenVMC Proxy" : "Paper"}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <StatusPill status={server.status} />
          <Btn variant={isActive ? "ghost" : "primary"} onClick={(e) => { (e as unknown as MouseEvent).stopPropagation?.(); onLaunch(); }} style={{ padding: "5px 10px", fontSize: 12 }}>
            {isActive ? t.open : t.launch}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function NewServerCard({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", height: "100%", minHeight: 160, background: "transparent", border: "2px dashed var(--border)", borderRadius: 8, color: "var(--text-muted)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, transition: "border-color 0.15s, color 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--green)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--green-light)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{t.new}</span>
    </button>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
function SettingsPage({ snapshot, onLogout }: { snapshot: LauncherSnapshot; onLogout: () => Promise<void> }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <div style={{ padding: "32px", overflow: "auto", height: "100%" }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t.settingsPage.title}</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-soft)" }}>{t.settingsPage.subtitle}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        <SettingsBlock title={t.settingsPage.general}>
          <SettingsLine label={t.settingsPage.language}>
            <Select value={locale} onChange={(v) => setLocale(v as LocaleCode)}>
              {Object.entries(LOCALES).map(([code, { label }]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </Select>
          </SettingsLine>
          <SettingsLine label={t.settingsPage.javaRuntime}><strong>{t.settingsPage.javaRuntimeValue}</strong></SettingsLine>
          <SettingsLine label={t.settingsPage.concurrentServers}><strong>{t.settingsPage.concurrentServersValue}</strong></SettingsLine>
        </SettingsBlock>

        <SettingsBlock title={t.settingsPage.account}>
          <SettingsLine label={t.settingsPage.email}><strong>{snapshot.account?.email}</strong></SettingsLine>
          <SettingsLine label={t.settingsPage.plan}><strong>{snapshot.account?.plan}</strong></SettingsLine>
          <SettingsLine label={t.settingsPage.serverLimit}><strong>{snapshot.account ? `${snapshot.account.serverCount}/${snapshot.account.maxServers}` : "—"}</strong></SettingsLine>
          <SettingsLine label={t.settingsPage.linkedDevice}><code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--green-light)" }}>{snapshot.deviceLock.deviceId}</code></SettingsLine>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "12px 0 0" }}>{t.settingsPage.deviceNote}</p>
          <div style={{ marginTop: 16 }}>
            <Btn variant="ghost" onClick={() => void onLogout()}>{t.settingsPage.logout}</Btn>
          </div>
        </SettingsBlock>

        <SettingsBlock title={t.settingsPage.about}>
          <p style={{ fontSize: 13, color: "var(--text-soft)", margin: 0, lineHeight: 1.7 }}>{t.settingsPage.aboutText}</p>
        </SettingsBlock>
      </div>
    </div>
  );
}

function SettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "20px 22px" }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-soft)" }}>{title}</h3>
      {children}
    </div>
  );
}

function SettingsLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--text-soft)", flexShrink: 0 }}>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <motion.div initial="hidden" animate="show" variants={fadeUp} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 32px", textAlign: "center", gap: 16 }}>
      <div style={{ width: 64, height: 64, background: "rgba(76,158,63,0.1)", border: "1px dashed rgba(76,158,63,0.35)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "var(--green)" }}>+</div>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t.emptyState.title}</h3>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text-soft)", maxWidth: 380, lineHeight: 1.6 }}>{t.emptyState.subtitle}</p>
      <Btn variant="primary" onClick={onCreate}>{t.emptyState.cta}</Btn>
    </motion.div>
  );
}

// ─── Create Server Dialog ─────────────────────────────────────────────────────
function CreateServerDialog({ snapshot, onClose, onCreate }: { snapshot: LauncherSnapshot; onClose: () => void; onCreate: (p: CreateServerPayload) => Promise<void> }) {
  const { t } = useI18n();
  const defaultCatalog = snapshot.catalog[0];
  const [kind, setKind] = useState<CreateServerPayload["kind"]>(defaultCatalog.kind);
  const versions = useMemo(
    () => snapshot.catalog.find((e) => e.kind === kind)?.versions ?? defaultCatalog.versions,
    [kind, snapshot.catalog]
  );
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState(versions[0]);
  const [memoryMb, setMemoryMb] = useState(4096);
  const [vmcMode, setVmcMode] = useState<NetworkMode>("public");
  useEffect(() => setVersion(versions[0]), [versions]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 10, width: 440, padding: "28px 30px", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>{t.createServer.title}</h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-soft)" }}>{t.createServer.subtitle}</p>

        <form onSubmit={(e) => { e.preventDefault(); void onCreate({ displayName, kind, version, memoryMb, vmcMode }); }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FormField label={t.createServer.name}>
            <Input value={displayName} onChange={setDisplayName} placeholder={t.createServer.namePlaceholder} />
          </FormField>
          <FormField label={t.createServer.type}>
            <Select value={kind} onChange={(v) => setKind(v as CreateServerPayload["kind"])}>
              {snapshot.catalog.map((e) => <option key={e.kind} value={e.kind}>{e.label}</option>)}
            </Select>
          </FormField>
          <FormField label={t.createServer.version}>
            <Select value={version} onChange={setVersion}>
              {versions.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          </FormField>
          <FormField label={t.createServer.memory}>
            <Input type="number" value={memoryMb} onChange={(v) => setMemoryMb(Number(v))} />
          </FormField>
          {kind === "paper-vmc" && (
            <FormField label={t.createServer.visibility}>
              <Select value={vmcMode} onChange={(v) => setVmcMode(v as NetworkMode)}>
                <option value="public">{t.vmcSettings.modes.public}</option>
                <option value="code">{t.vmcSettings.modes.code}</option>
                <option value="whitelist">{t.vmcSettings.modes.whitelist}</option>
              </Select>
            </FormField>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
            <Btn variant="primary" type="submit">{t.createServer.cta}</Btn>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Server Panel ─────────────────────────────────────────────────────────────
function ServerPanel({ 
  details, route, onNavigate, onStart, onStop, onCommand, onSearchPlugins, onInstallPlugin, onSaveSettings, onSaveVmc, onReloadDetails, withFeedback, setFeedback 
}: {
  details: ServerDetails;
  route: ServerRoute;
  onNavigate: (r: ServerRoute) => void;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onCommand: (cmd: string) => Promise<void>;
  onSearchPlugins: (payload: PluginSearchRequest) => Promise<PluginSearchResult[]>;
  onInstallPlugin: (payload: PluginInstallRequest) => Promise<void>;
  onSaveSettings: (s: ServerRecord["settings"]) => Promise<void>;
  onSaveVmc: (v: Pick<ServerRecord["vmc"], "slug" | "mode" | "whitelist">) => Promise<void>;
  onReloadDetails: () => Promise<void>;
  withFeedback: (work: () => Promise<void>) => Promise<void>;
  setFeedback: (m: string | null) => void;
}) {
  const { t } = useI18n();
  const isRunning = details.server.status === "running";
  const isPlugins = details.server.kind === "paper" || details.server.kind === "paper-vmc";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{details.server.displayName}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{details.server.kind === "paper-vmc" ? "Paper + OpenVMC Proxy" : "Paper"}</div>
        </div>
        <nav style={{ flex: 1, padding: "8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          <ServerNavLink active={route === "console"} label={t.serverNav.console} onClick={() => onNavigate("console")} />
          <ServerNavLink active={route === "files"} label={t.serverNav.files} onClick={() => onNavigate("files")} />
          <ServerNavLink active={route === "plugins"} label={isPlugins ? t.serverNav.plugins : t.serverNav.mods} onClick={() => onNavigate("plugins")} />
          <ServerNavLink active={route === "settings"} label={t.serverNav.serverSettings} suffix="paper" onClick={() => onNavigate("settings")} />
          <ServerNavLink active={route === "vmc"} label={t.serverNav.vmcSettings} suffix="vmc" onClick={() => onNavigate("vmc")} />
        </nav>
      </aside>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflow: "auto" }}>
          <AnimatePresence mode="wait">
            <motion.div 
              key={route.kind === "server" ? "server-view" : "launcher-view"} 
              initial="hidden" animate="show" exit="exit" variants={fadeUp} 
              style={{ height: "100%" }}
            >
              {route === "console" && <ConsoleView details={details} onCommand={onCommand} />}
              {route === "files" && <FilesView details={details} onReloadDetails={onReloadDetails} withFeedback={withFeedback} setFeedback={setFeedback} />}
              {route === "plugins" && (
                <PluginsView
                  details={details}
                  onSearch={onSearchPlugins}
                  onInstall={onInstallPlugin}
                />
              )}
              {route === "settings" && <ServerSettingsView details={details} onSave={onSaveSettings} />}
              {route === "vmc" && <VmcSettingsView details={details} onSave={onSaveVmc} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Stats sidebar */}
        <aside style={{ width: 180, background: "var(--bg-sidebar)", borderLeft: "1px solid var(--border)", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0, overflowY: "auto" }}>
          <Btn
            variant={isRunning ? "danger" : "primary"}
            onClick={() => void (isRunning ? onStop() : onStart())}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {isRunning ? t.stop : t.launch}
          </Btn>
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          <MetricCard label={t.stats.uptime} value={formatUptime(details.stats.uptimeSeconds)} />
          <MetricCard label={t.stats.cpu} value={`${details.stats.cpuPercent}% / ${details.stats.cpuLimitPercent}%`} />
          <MetricCard label={t.stats.ram} value={`${formatMb(details.stats.ramUsedMb)} / ${formatMb(details.stats.ramLimitMb)}`} />
          <MetricCard label={t.stats.storage} value={formatMb(details.stats.storageMb)} />
          {details.server.vmc.enabled && (
            <MetricCard label={t.stats.vmcNetwork} value={details.server.vmc.state === "connected" ? t.stats.connected : t.stats.offline} />
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Console ──────────────────────────────────────────────────────────────────
function ConsoleView({ details, onCommand }: { details: ServerDetails; onCommand: (cmd: string) => Promise<void> }) {
  const { t } = useI18n();
  const [cmd, setCmd] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [details.consoleLines]);

  const levelColor: Record<string, string> = {
    info: "var(--text-soft)",
    warn: "var(--yellow)",
    error: "#ff6b6b",
    command: "var(--green-light)",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "16px" }}>
      <div
        ref={outputRef}
        style={{ flex: 1, background: "#0d0f12", border: "1px solid var(--border)", borderRadius: 6, padding: "12px 14px", overflow: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 12, lineHeight: 1.7 }}
      >
        {details.consoleLines.map((line) => (
          <div key={line.id} style={{ color: levelColor[line.level] ?? "var(--text-soft)" }}>
            <span style={{ color: "var(--text-muted)", marginRight: 8 }}>{new Date(line.timestamp).toLocaleTimeString("fr-FR")}</span>
            {line.text}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); void onCommand(cmd); setCmd(""); }}
        style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}
      >
        <span style={{ color: "var(--green-light)", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 14 }}>&gt;</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder={t.console.commandPlaceholder}
          disabled={details.server.status !== "running"}
          style={{ flex: 1, background: "#0d0f12", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", padding: "8px 10px", outline: "none", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}
        />
      </form>
    </div>
  );
}

// ─── Files ────────────────────────────────────────────────────────────────────
function FilesView({ details, onReloadDetails, withFeedback, setFeedback }: { details: ServerDetails; onReloadDetails: () => Promise<void>; withFeedback: (work: () => Promise<void>) => Promise<void>; setFeedback: (m: string | null) => void }) {
  console.log("[Renderer] FilesView mounting with files count:", details?.files?.length);
  const { t } = useI18n();
  
  const [currentDirectory, setCurrentDirectory] = useState(() => {
    if (!details?.files) return "";
    return details.files.some(f => f.path === "paper" && f.kind === "directory") ? "paper" : "";
  });

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [creationModal, setCreationModal] = useState<{ kind: "file" | "directory" | "rename"; target?: FileEntry } | null>(null);
  const [creationName, setCreationName] = useState("");

  const currentItems = useMemo(() => {
    if (!details?.files) return [];
    try {
      return details.files.filter((f) => {
        if (!f || !f.path) return false;
        if (f.path === currentDirectory) return false;
        const parentDir = f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/")) : "";
        return parentDir === currentDirectory;
      }).sort((a, b) => {
        if (a.kind === b.kind) return (a.name || "").localeCompare(b.name || "");
        return a.kind === "directory" ? -1 : 1;
      });
    } catch (e) {
      console.error("[Renderer] Error in currentItems memo:", e);
      return [];
    }
  }, [details?.files, currentDirectory]);


  useEffect(() => {
    if (!selectedFile) {
      setContent("");
      setDirty(false);
      setFileError(null);
      return;
    }
    
    let isMounted = true;
    setLoadingFile(true);
    setFileError(null);
    window.vmcLauncher.readServerFile(details.server.serverUuid, selectedFile)
      .then((file) => {
        if (isMounted) {
          setContent(file.content);
          setDirty(false);
        }
      })
      .catch((err) => {
        if (isMounted) setFileError(err instanceof Error ? err.message : t.error);
      })
      .finally(() => {
        if (isMounted) setLoadingFile(false);
      });
      
    return () => { isMounted = false; };
  }, [selectedFile, details.server.serverUuid, t.error]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setFileError(null);
    try {
      await window.vmcLauncher.writeServerFile(details.server.serverUuid, selectedFile, content);
      setDirty(false);
      await onReloadDetails();
    } catch (error) {
      setFileError(error instanceof Error ? error.message : t.error);
    } finally {
      setSaving(false);
    }
  };

  const handleGoBack = () => {
    if (dirty) {
      if (!window.confirm(t.files.unsavedChanges)) return;
    }
    setSelectedFile(null);
  };

  const handleCreateDirectory = async () => {
    setCreationName("");
    setCreationModal({ kind: "directory" });
  };




  const handleCreateFile = async () => {
    setCreationName("");
    setCreationModal({ kind: "file" });
  };




  const handleUpload = async () => {
    await withFeedback(async () => {
      await window.vmcLauncher.uploadServerFiles(details.server.serverUuid, currentDirectory);
      await onReloadDetails();
    });
  };


  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Récupération des chemins de fichiers (spécifique à Electron)
    const files = Array.from(e.dataTransfer.files).map(f => window.electronAPI.getPathForFile(f)).filter(Boolean);
    window.vmcLauncher.log("[Renderer] Drop event detected, paths:", files);
    
    if (files.length === 0) return;
    
    await withFeedback(async () => {
      setFeedback(t.files.loadingFile || "Upload en cours...");
      await window.vmcLauncher.uploadServerFiles(details.server.serverUuid, currentDirectory, files);
      await onReloadDetails();
      setFeedback(null);
    });
  };


  const performCreation = async () => {
    if (!creationModal || !creationName.trim()) return;
    const name = creationName.trim();
    const modal = creationModal;
    setCreationModal(null);
    setCreationName("");

    await withFeedback(async () => {
      if (modal.kind === "directory") {
        const relPath = currentDirectory ? `${currentDirectory}/${name}` : name;
        await window.vmcLauncher.createServerDirectory(details.server.serverUuid, relPath);
      } else if (modal.kind === "file") {
        const relPath = currentDirectory ? `${currentDirectory}/${name}` : name;
        await window.vmcLauncher.writeServerFile(details.server.serverUuid, relPath, "");
        setSelectedFile(relPath);
      } else if (modal.kind === "rename" && modal.target) {
        const item = modal.target;
        const parentDir = item.path.includes("/") ? item.path.substring(0, item.path.lastIndexOf("/")) : "";
        const newPath = parentDir ? `${parentDir}/${name}` : name;
        await window.vmcLauncher.moveServerFiles(details.server.serverUuid, [item.path], newPath);
      }
      await onReloadDetails();
    });
  };

  const handleRenameFile = async (item: FileEntry) => {
    setCreationName(item.name);
    setCreationModal({ kind: "rename", target: item });
  };


  const handleDeleteFile = async (item: FileEntry) => {
    if (!window.confirm(t.files.deleteConfirm)) return;
    await withFeedback(async () => {
      await window.vmcLauncher.deleteServerFiles(details.server.serverUuid, [item.path]);
      await onReloadDetails();
    });
  };


  const handleNavigateUp = () => {
    if (currentDirectory === "") return;
    const parts = currentDirectory.split("/");
    parts.pop();
    setCurrentDirectory(parts.join("/"));
  };

  const breadcrumbParts = currentDirectory ? currentDirectory.split("/") : [];

  const getLanguage = (filename: string | null) => {
    if (!filename) return 'none';
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.yml') || filename.endsWith('.yaml')) return 'yaml';
    if (filename.endsWith('.properties')) return 'properties';
    if (filename.endsWith('.sh')) return 'bash';
    if (filename.endsWith('.md')) return 'markdown';
    if (filename.endsWith('.toml')) return 'toml';
    if (filename.endsWith('.c')) return 'c';
    if (filename.endsWith('.cpp') || filename.endsWith('.h')) return 'cpp';
    if (filename.endsWith('.cs')) return 'csharp';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.go')) return 'go';
    if (filename.endsWith('.html')) return 'markup';
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
    if (filename.endsWith('.lua')) return 'lua';
    if (filename.endsWith('.sql')) return 'sql';
    if (filename.endsWith('.php')) return 'php';
    if (filename.endsWith('.py')) return 'python';
    if (filename.endsWith('.rb')) return 'ruby';
    if (filename.endsWith('.rs')) return 'rust';
    if (filename.endsWith('.sass') || filename.endsWith('.scss')) return 'scss';
    if (filename.endsWith('.xml')) return 'markup';
    if (filename.endsWith('.diff')) return 'diff';
    if (filename.toLowerCase() === 'dockerfile') return 'docker';
    if (filename.endsWith('.pug')) return 'pug';
    if (filename.endsWith('.vue')) return 'vue';
    if (filename.endsWith('.conf')) return 'nginx';
    return 'none';
  };

  const highlightCode = (code: string, language: string) => {
    if (language === 'none' || !code) return code;
    try {
      const grammar = Prism.languages[language];
      if (!grammar) return code;
      return Prism.highlight(code, grammar, language);
    } catch (e) {
      console.error("Prism error:", e);
      return code;
    }
  };


  const fileBreadcrumbParts = selectedFile ? selectedFile.split("/") : [];
  const fileName = fileBreadcrumbParts.pop();
  const fileDirParts = fileBreadcrumbParts;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "24px 32px", overflow: "hidden", background: "var(--bg)", position: "relative" }}>
      {/* Creation Modal Overlay */}
      {creationModal && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 100 }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: "var(--bg-card)", border: "1px solid var(--border-hover)", borderRadius: 8, width: 400, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>
              {creationModal.kind === "directory" ? t.files.createDirectory : creationModal.kind === "file" ? t.files.newFile : t.files.rename}
            </h3>
            <Input 
              value={creationName} 
              onChange={setCreationName} 
              placeholder="Nom..." 
              autoFocus 
              onKeyDown={(e: any) => {
                if (e.key === "Enter") performCreation();
                if (e.key === "Escape") setCreationModal(null);
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <Btn variant="ghost" onClick={() => setCreationModal(null)}>{t.cancel || "Annuler"}</Btn>
              <Btn variant="primary" onClick={performCreation} disabled={!creationName.trim()}>{t.confirm || "Confirmer"}</Btn>
            </div>
          </motion.div>
        </div>
      )}
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-soft)" }}>
          <span 
            style={{ cursor: "pointer", color: "var(--text)", fontWeight: 600 }} 
            onClick={() => {
              setCurrentDirectory("");
              setSelectedFile(null);
            }}
          >
            {details.server.name}
          </span>

          
          {!selectedFile ? (
            breadcrumbParts.map((part, idx) => {
              const pathSoFar = breadcrumbParts.slice(0, idx + 1).join("/");
              return (
                <span key={pathSoFar} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--text-muted)" }}>/</span>
                  <span style={{ cursor: "pointer", color: idx === breadcrumbParts.length - 1 ? "#fff" : "var(--text)", fontWeight: idx === breadcrumbParts.length - 1 ? 600 : 400 }} onClick={() => setCurrentDirectory(pathSoFar)}>
                    {part}
                  </span>
                </span>
              );
            })
          ) : (
            <>
              {fileDirParts.map((part, idx) => {
                const pathSoFar = fileDirParts.slice(0, idx + 1).join("/");
                // On permet de cliquer sur n'importe quel dossier parent du chemin
                return (
                  <span key={pathSoFar} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-muted)" }}>/</span>
                    <span 
                      style={{ cursor: "pointer", color: "var(--text)" }} 
                      onClick={() => {
                        setCurrentDirectory(pathSoFar);
                        setSelectedFile(null);
                      }}
                    >
                      {part}
                    </span>

                  </span>
                );
              })}
              <span style={{ color: "var(--text-muted)" }}>/</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{fileName}</span>
            </>
          )}
        </div>

        {!selectedFile ? (
          <div style={{ display: "flex", gap: 10 }}>
            <Btn 
              variant="outline" 
              onClick={() => {
                console.log("[Renderer] Clicked Nouveau dossier");
                window.vmcLauncher.log("Button 'Nouveau dossier' clicked");
                handleCreateDirectory();
              }} 
              style={{ padding: "8px 14px" }}
            >
              {t.files.createDirectory}
            </Btn>
            <Btn 
              variant="primary" 
              onClick={() => {
                console.log("[Renderer] Clicked Upload");
                window.vmcLauncher.log("Button 'Upload' clicked");
                handleUpload();
              }} 
              style={{ padding: "8px 14px", background: "#3b82f6", boxShadow: "0 2px 0 #2563eb", color: "#fff" }}
            >
              {t.files.upload}
            </Btn>
            <Btn 
              variant="primary" 
              onClick={() => {
                console.log("[Renderer] Clicked Nouveau fichier");
                window.vmcLauncher.log("Button 'Nouveau fichier' clicked");
                handleCreateFile();
              }} 
              style={{ padding: "8px 14px", background: "#3b82f6", boxShadow: "0 2px 0 #2563eb", color: "#fff" }}
            >
              {t.files.newFile}
            </Btn>
          </div>
        ) : (
          <Btn variant="outline" onClick={handleGoBack} style={{ padding: "6px 12px", fontSize: 12 }}>
            {t.files.back}
          </Btn>
        )}
      </div>

      {/* Content Area */}
      <div 
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
        }} 
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          window.vmcLauncher.log("Drop event triggered on container");
          handleDrop(e);
        }}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}
      >
        
        {!selectedFile ? (
          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <tbody>
                {(currentDirectory !== "" && currentDirectory !== "paper") && (
                  <tr
                    onClick={handleNavigateUp}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "14px 16px", width: 40, color: "var(--text-muted)" }}>
                      <input type="checkbox" disabled style={{ width: 16, height: 16, cursor: "not-allowed" }} />
                    </td>
                    <td style={{ padding: "14px 0", color: "var(--text-muted)" }}>←</td>
                    <td style={{ padding: "14px 16px", color: "var(--text-soft)" }}>{t.files.back}</td>
                    <td colSpan={3}></td>
                  </tr>
                )}
                {currentItems.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>{t.files.emptyFolder}</td>
                  </tr>
                )}
                {currentItems.map((item) => (
                  <tr
                    key={item.path}
                    onClick={() => {
                      if (item.kind === "directory") setCurrentDirectory(item.path);
                      else setSelectedFile(item.path);
                    }}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td onClick={(e) => e.stopPropagation()} style={{ padding: "14px 16px", width: 40, color: "var(--text-muted)" }}>
                      <input type="checkbox" style={{ width: 16, height: 16, accentColor: "#3b82f6" }} />
                    </td>
                    <td style={{ padding: "14px 0", width: 30, color: "var(--text-soft)" }}>
                      {item.kind === "directory" ? <IcoFolder /> : <IcoFile />}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#fff", fontWeight: 500 }}>
                      {item.name}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-muted)", width: 120 }}>
                      {item.kind === "file" ? `${Math.max(1, Math.round(item.size / 1024))} Ko` : ""}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-muted)", width: 200 }}>
                      {(() => {
                        try {
                          return new Date(item.modifiedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
                        } catch {
                          return "—";
                        }
                      })()}
                    </td>

                    <td onClick={(e) => e.stopPropagation()} style={{ padding: "14px 16px", width: 120, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button 
                          onClick={() => handleRenameFile(item)}
                          style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--text-muted)", transition: "color 0.1s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                          title={t.files.rename}
                        >
                          <IcoEdit size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteFile(item)}
                          style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--text-muted)", transition: "color 0.1s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                          title={t.files.delete}
                        >
                          <IcoTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ flex: 1, overflow: "auto", position: "relative", background: "#1a1c23" }}>
              {loadingFile ? (
                <div style={{ padding: 20, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{t.files.loadingFile}</div>
              ) : (
                <div style={{ padding: "12px 16px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", minHeight: "100%" }}>
                  <Editor
                    value={content}
                    onValueChange={(code) => { setContent(code); setDirty(true); }}
                    highlight={(code) => highlightCode(code, getLanguage(selectedFile))}

                    padding={0}
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 13,
                      minHeight: "100%",
                      outline: "none",
                    }}
                    textareaClassName="editor-textarea"
                  />
                </div>
              )}
            </div>
            
            {/* Error banner */}
            {fileError && (
              <div style={{ background: "rgba(231, 76, 60, 0.15)", borderTop: "1px solid rgba(231, 76, 60, 0.3)", color: "#ff8f87", padding: "8px 16px", fontSize: 12 }}>
                {fileError}
              </div>
            )}
            
            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "12px 16px", background: "var(--bg-card)", borderTop: "1px solid var(--border)" }}>
              <Btn
                variant="primary"
                disabled={!dirty || saving || loadingFile}
                onClick={handleSave}
                style={{ background: "#3b82f6", boxShadow: "0 2px 0 #2563eb", color: "#fff", opacity: (!dirty || saving) ? 0.6 : 1 }}
              >
                {saving ? "SAVING..." : "SAVE CONTENT"}
              </Btn>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Plugins ──────────────────────────────────────────────────────────────────
function PluginsView({
  details,
  onSearch,
  onInstall,
}: {
  details: ServerDetails;
  onSearch: (payload: PluginSearchRequest) => Promise<PluginSearchResult[]>;
  onInstall: (payload: PluginInstallRequest) => Promise<void>;
}) {
  const { t } = useI18n();
  const [provider, setProvider] = useState<PluginProvider>("modrinth");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [results, setResults] = useState<PluginSearchResult[]>([]);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  useEffect(() => {
    setResults([]);
    setLocalFeedback(null);
  }, [provider, details.server.serverUuid]);

  const pluginsDir = `${details.server.rootDir}/paper/plugins`;

  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLocalFeedback(null);
      return;
    }

    setSearching(true);
    setLocalFeedback(null);
    try {
      const nextResults = await onSearch({
        serverUuid: details.server.serverUuid,
        provider,
        query: trimmed,
      });
      setResults(nextResults);
      if (nextResults.length === 0) {
        setLocalFeedback(t.plugins.noResults);
      }
    } catch (error) {
      setLocalFeedback(error instanceof Error ? error.message : t.error);
    } finally {
      setSearching(false);
    }
  }

  async function handleInstall(result: PluginSearchResult) {
    setInstallingId(result.projectId);
    setLocalFeedback(null);
    try {
      await onInstall({
        serverUuid: details.server.serverUuid,
        provider: result.provider,
        projectId: result.projectId,
        slug: result.slug,
        author: result.author,
      });
      setLocalFeedback(t.plugins.installSuccess);
    } catch (error) {
      setLocalFeedback(error instanceof Error ? error.message : t.error);
    } finally {
      setInstallingId(null);
    }
  }

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700 }}>{t.plugins.title}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ minWidth: 180 }}>
            <FormField label={t.plugins.sourceLabel}>
              <Select value={provider} onChange={(value) => setProvider(value as PluginProvider)}>
                <option value="modrinth">{t.plugins.providers.modrinth}</option>
                <option value="curseforge">{t.plugins.providers.curseforge}</option>
                <option value="hangar">{t.plugins.providers.hangar}</option>
              </Select>
            </FormField>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSearch();
              }
            }}
            placeholder={t.plugins.searchPlaceholder}
            style={{ flex: 1, minWidth: 260, background: "var(--bg-input)", border: "1px solid var(--border-hover)", borderRadius: 4, color: "var(--text)", padding: "8px 12px", outline: "none", marginTop: 20 }}
          />
          <Btn variant="outline" onClick={() => void handleSearch()} disabled={searching} style={{ marginTop: 20 }}>
            {searching ? t.plugins.searching : t.plugins.searchBtn}
          </Btn>
        </div>
        {provider === "curseforge" && (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-muted)" }}>{t.plugins.curseForgeKeyHint}</p>
        )}
        {localFeedback && (
          <div style={{ marginBottom: 12, fontSize: 12, color: localFeedback === t.plugins.installSuccess ? "var(--green-light)" : "#ffb4a8" }}>
            {localFeedback}
          </div>
        )}
      </div>

      <section>
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          {t.plugins.installedTitle}
        </div>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          {details.plugins.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 13, color: "var(--text-soft)" }}>{t.plugins.installedEmpty}</div>
          ) : details.plugins.map((plugin, index) => (
            <div key={plugin.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: index < details.plugins.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>{plugin.displayName}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{plugin.fileName}</div>
              </div>
              <span style={{ fontSize: 11, color: plugin.enabled ? "var(--green-light)" : "var(--text-muted)" }}>
                {plugin.enabled ? "JAR" : "DISABLED"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          {t.search}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {results.map((result) => (
            <div key={`${result.provider}:${result.projectId}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {result.iconUrl ? (
                  <img src={result.iconUrl} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", background: "rgba(255,255,255,0.04)" }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(76,158,63,0.12)", display: "grid", placeItems: "center", color: "var(--green-light)", fontWeight: 700 }}>
                    {result.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--green-light)", fontWeight: 700 }}>{t.plugins.providers[result.provider]}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.title}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-soft)", lineHeight: 1.5, minHeight: 54 }}>{result.summary}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: 11, background: "rgba(76,158,63,0.12)", color: "var(--green-light)", padding: "2px 8px", borderRadius: 99 }}>
                  {result.compatibleWithServer ? t.plugins.compatible : t.plugins.incompatible}
                </span>
                {result.categories.slice(0, 2).map((category) => (
                  <span key={category} style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", color: "var(--text-soft)", padding: "2px 8px", borderRadius: 99 }}>
                    {category}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {result.author} · {result.downloads.toLocaleString("fr-FR")} dl
              </div>
              <div style={{ marginTop: "auto" }}>
                <Btn
                  variant="primary"
                  onClick={() => void handleInstall(result)}
                  disabled={installingId === result.projectId}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {installingId === result.projectId ? t.plugins.installing : t.plugins.install}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Server Settings ──────────────────────────────────────────────────────────
function ServerSettingsView({ details, onSave }: { details: ServerDetails; onSave: (s: ServerRecord["settings"]) => Promise<void> }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState(details.server.settings);
  useEffect(() => setSettings(details.server.settings), [details.server.settings]);
  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>{t.serverSettings.title}</h2>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-soft)" }}>{t.serverSettings.subtitle}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 640 }}>
        <FormField label={t.serverSettings.motd}>
          <Input value={settings.motd} onChange={(v) => setSettings({ ...settings, motd: v })} />
        </FormField>
        <FormField label={t.serverSettings.difficulty}>
          <Select value={settings.difficulty} onChange={(v) => setSettings({ ...settings, difficulty: v as typeof settings.difficulty })}>
            {(["peaceful", "easy", "normal", "hard"] as const).map((d) => <option key={d} value={d}>{t.serverSettings.difficulties[d]}</option>)}
          </Select>
        </FormField>
        <FormField label={t.serverSettings.gamemode}>
          <Select value={settings.gamemode} onChange={(v) => setSettings({ ...settings, gamemode: v as typeof settings.gamemode })}>
            {(["survival", "creative", "adventure"] as const).map((g) => <option key={g} value={g}>{t.serverSettings.gamemodes[g]}</option>)}
          </Select>
        </FormField>
        <FormField label={t.serverSettings.maxPlayers}>
          <Input type="number" value={settings.maxPlayers} onChange={(v) => setSettings({ ...settings, maxPlayers: Number(v) })} />
        </FormField>
        <FormField label={t.serverSettings.viewDistance}>
          <Input type="number" value={settings.viewDistance} onChange={(v) => setSettings({ ...settings, viewDistance: Number(v) })} />
        </FormField>
        <FormField label={t.serverSettings.simulationDistance}>
          <Input type="number" value={settings.simulationDistance} onChange={(v) => setSettings({ ...settings, simulationDistance: Number(v) })} />
        </FormField>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={settings.pvp} onChange={(e) => setSettings({ ...settings, pvp: e.target.checked })} style={{ accentColor: "var(--green)", width: 16, height: 16 }} />
        <span style={{ fontSize: 14 }}>{t.serverSettings.pvp}</span>
      </label>
      <div style={{ marginTop: 24 }}>
        <Btn variant="primary" onClick={() => void onSave(settings)}>{t.save}</Btn>
      </div>
    </div>
  );
}

// ─── VMC Settings ─────────────────────────────────────────────────────────────
function VmcSettingsView({ details, onSave }: { details: ServerDetails; onSave: (v: Pick<ServerRecord["vmc"], "slug" | "mode" | "whitelist">) => Promise<void> }) {
  const { t } = useI18n();
  const [slug, setSlug] = useState(details.server.vmc.slug);
  const [mode, setMode] = useState(details.server.vmc.mode);
  const [whitelistText, setWhitelistText] = useState(details.server.vmc.whitelist.join(", "));
  useEffect(() => {
    setSlug(details.server.vmc.slug);
    setMode(details.server.vmc.mode);
    setWhitelistText(details.server.vmc.whitelist.join(", "));
  }, [details.server.vmc.slug, details.server.vmc.mode, details.server.vmc.whitelist.join(",")]);

  if (!details.server.vmc.enabled) {
    return <div style={{ padding: "24px" }}><h2>{t.vmcSettings.title}</h2><p style={{ color: "var(--text-soft)" }}>{t.vmcSettings.notEnabled}</p></div>;
  }

  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ margin: "0 0 24px", fontSize: 17, fontWeight: 700 }}>{t.vmcSettings.title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 640 }}>
        <FormField label={t.vmcSettings.slug}>
          <Input value={slug} onChange={setSlug} />
        </FormField>
        <FormField label={t.vmcSettings.networkMode}>
          <Select value={mode} onChange={(v) => setMode(v as NetworkMode)}>
            <option value="public">{t.vmcSettings.modes.public}</option>
            <option value="code">{t.vmcSettings.modes.code}</option>
            <option value="whitelist">{t.vmcSettings.modes.whitelist}</option>
          </Select>
        </FormField>
        <FormField label={t.vmcSettings.currentCode}>
          <Input value={details.server.vmc.lastAccessCode ?? "—"} onChange={() => {}} disabled />
        </FormField>
        <FormField label={t.vmcSettings.whitelist}>
          <textarea
            value={whitelistText}
            onChange={(e) => setWhitelistText(e.target.value)}
            placeholder={t.vmcSettings.whitelistPlaceholder}
            rows={3}
            style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-hover)", borderRadius: 4, color: "var(--text)", padding: "8px 10px", resize: "vertical", outline: "none" }}
          />
        </FormField>
      </div>
      <div style={{ marginTop: 24 }}>
        <Btn variant="primary" onClick={() => void onSave({ slug, mode, whitelist: whitelistText.split(",").map((s) => s.trim()).filter(Boolean) })}>{t.save}</Btn>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export function App() {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [details, setDetails] = useState<ServerDetails | null>(null);
  const [route, setRoute] = useState<ParsedRoute>(() => parseHash(window.location.hash));
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [authMode] = useState<"login" | "register">("login");

  useEffect(() => {
    void refreshSnapshot();
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const unsub = window.vmcLauncher.onEvent(() => {
      void refreshSnapshot();
      if (route.kind === "server") void refreshServer(route.serverUuid);
    });
    return () => unsub();
  }, [route]);

  useEffect(() => {
    if (route.kind === "server") {
      void refreshServer(route.serverUuid);
      const poll = setInterval(() => {
        void refreshServer(route.serverUuid);
      }, 3000);
      return () => clearInterval(poll);
    } else {
      setDetails(null);
      return undefined;
    }
  }, [route.kind === "server" ? (route as any).serverUuid : null]);

  async function refreshSnapshot() {
    console.log("[Renderer] refreshSnapshot starting...");
    try {
      const next = await window.vmcLauncher.getSnapshot();
      console.log("[Renderer] refreshSnapshot received:", next);
      setSnapshot(next);
    } catch (err: any) {
      console.error("[Renderer] refreshSnapshot ERROR:", err);
      setBootError(err.message || String(err));
    }
  }
  async function refreshServer(id: string) {
    try {
      const next = await window.vmcLauncher.getServerDetails(id);
      setDetails(next);
    } catch (err) {
      console.error("[Renderer] refreshServer ERROR:", err);
    }
  }

  const withFeedback = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setFeedback(null);
    try { await work(); }
    catch (err) { setFeedback(err instanceof Error ? err.message : t.error); }
    finally { setBusy(false); }
  }
  , [t.error]);

  async function handleAuth(payload: AuthPayload, mode: "login" | "register") {
    await withFeedback(async () => {
      if (mode === "register") await window.vmcLauncher.register(payload);
      else await window.vmcLauncher.login(payload);
      await refreshSnapshot();
    });
  }
  async function handleCreateServer(payload: CreateServerPayload) {
    await withFeedback(async () => {
      const server = await window.vmcLauncher.createServer(payload);
      await refreshSnapshot();
      setCreateOpen(false);
      await window.vmcLauncher.openServerWindow(server.serverUuid);
    });
  }
  async function handleLaunchServer(id: string) {
    await withFeedback(async () => {
      await window.vmcLauncher.openServerWindow(id);
      await window.vmcLauncher.startServer(id);
      await refreshSnapshot();
      if (route.kind === "server" && (route as any).serverUuid === id) await refreshServer(id);
    });
  }
  async function handleOpenServer(id: string) {
    await withFeedback(async () => { await window.vmcLauncher.openServerWindow(id); });
  }
  async function handleStopServer(id: string) {
    await withFeedback(async () => {
      await window.vmcLauncher.stopServer(id);
      await refreshSnapshot();
      if (route.kind === "server") await refreshServer(id);
    });
  }
  async function handleConsoleCommand(id: string, cmd: string) {
    await withFeedback(async () => {
      await window.vmcLauncher.sendConsoleCommand(id, cmd);
      await refreshServer(id);
    });
  }
  async function handleSearchPlugins(payload: PluginSearchRequest) {
    return window.vmcLauncher.searchPlugins(payload);
  }
  async function handleInstallPlugin(payload: PluginInstallRequest) {
    await withFeedback(async () => {
      await window.vmcLauncher.installPlugin(payload);
      await refreshServer(payload.serverUuid);
    });
  }
  async function handleUpdateServerSettings(payload: UpdateServerSettingsPayload) {
    await withFeedback(async () => {
      await window.vmcLauncher.updateServerSettings(payload);
      await refreshSnapshot();
      await refreshServer(payload.serverUuid);
    });
  }
  async function handleUpdateVmcSettings(payload: UpdateVmcSettingsPayload) {
    await withFeedback(async () => {
      await window.vmcLauncher.updateVmcSettings(payload);
      await refreshSnapshot();
      await refreshServer(payload.serverUuid);
    });
  }
  async function handleLogout() {
    await withFeedback(async () => {
      await window.vmcLauncher.logout();
      setDetails(null);
      window.location.hash = "#/home";
      await refreshSnapshot();
    });
  }

  const [renamingServer, setRenamingServer] = useState<ServerRecord | null>(null);

  async function handleRenameServer(serverUuid: string) {
    const server = snapshot?.servers.find(s => s.serverUuid === serverUuid);
    if (server) setRenamingServer(server);
  }

  async function performRename(serverUuid: string, newName: string) {
    await withFeedback(async () => {
      await window.vmcLauncher.renameServer(serverUuid, newName);
      await refreshSnapshot();
      setRenamingServer(null);
    });
  }

  async function handleDeleteServer(serverUuid: string) {
    if (!window.confirm(t.files.deleteServerConfirm)) return;
    await withFeedback(async () => {
      await window.vmcLauncher.deleteServer(serverUuid);
      await refreshSnapshot();
    });
  }

  // ── Boot / Loading ──────────────────────────────────────────────────────
  if (bootError) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "#1a0505", color: "#ff8888", padding: 40, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>CRITICAL BOOT ERROR</div>
          <code style={{ background: "rgba(0,0,0,0.3)", padding: "8px 12px", borderRadius: 4, display: "block", marginBottom: 16 }}>{bootError}</code>
          <div style={{ marginTop: 24 }}>
            <button onClick={() => window.location.reload()} style={{ background: "#ff8888", color: "#1a0505", border: "none", padding: "10px 20px", borderRadius: 4, fontWeight: 800, cursor: "pointer" }}>RETRY</button>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "var(--bg)", color: "var(--text-soft)", fontSize: 14, letterSpacing: "0.1em" }}>
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>
          {t.loading}
        </motion.div>
      </div>
    );
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  if (!snapshot.account) {
    return (
      <AnimatePresence>
        <AuthScreen snapshot={snapshot} onAuth={handleAuth} busy={busy} feedback={feedback} />
        <AnimatePresence>
          {createOpen && <CreateServerDialog snapshot={snapshot} onClose={() => setCreateOpen(false)} onCreate={handleCreateServer} />}
          {renamingServer && <RenameServerDialog server={renamingServer} onClose={() => setRenamingServer(null)} onRename={performRename} />}
        </AnimatePresence>
      </AnimatePresence>
    );
  }

  // ── Server window ───────────────────────────────────────────────────────
  if (route.kind === "server") {
    if (!details) {
      return (
        <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "var(--bg)", color: "var(--text-soft)", fontSize: 14, letterSpacing: "0.1em" }}>
          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>{t.loading}</motion.div>
        </div>
      );
    }
    return (
      <>
        {feedback && <FeedbackBar message={feedback} />}
        <ServerPanel
          details={details}
          route={route.route}
          onNavigate={(r) => { window.location.hash = `#/server/${details.server.serverUuid}/${r}`; }}
          onStart={() => handleLaunchServer(details.server.serverUuid)}
          onStop={() => handleStopServer(details.server.serverUuid)}
          onCommand={(cmd) => handleConsoleCommand(details.server.serverUuid, cmd)}
          onSearchPlugins={handleSearchPlugins}
          onInstallPlugin={handleInstallPlugin}
          onSaveSettings={(s) => handleUpdateServerSettings({ serverUuid: details.server.serverUuid, settings: s })}
          onSaveVmc={(v) => handleUpdateVmcSettings({ serverUuid: details.server.serverUuid, vmc: v })}
          onReloadDetails={() => refreshServer(details.server.serverUuid)}
          withFeedback={withFeedback}
          setFeedback={setFeedback}
        />
      </>
    );
  }

  // ── Launcher shell ──────────────────────────────────────────────────────
  return (
    <>
      {feedback && <FeedbackBar message={feedback} />}
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        {/* Sidebar */}
        <aside style={{ width: 220, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {/* Profile */}
          <div style={{ padding: "18px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, background: "rgba(76,158,63,0.2)", border: "1px solid rgba(76,158,63,0.35)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "var(--green-light)", flexShrink: 0 }}>
              {snapshot.account.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{snapshot.account.displayName}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Plan {snapshot.account.plan.toLowerCase()}</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
            <SidebarLink active={route.kind === "launcher" && route.route === "home"} href="#/home" label={t.nav.home} icon={<IcoHome />} />
            <SidebarLink active={false} href="#" label={t.nav.editor} icon={<IcoEdit />} suffix={t.soon} disabled />
            <SidebarLink active={route.kind === "launcher" && route.route === "servers"} href="#/servers" label={t.nav.servers} icon={<IcoServers />} />
          </nav>

          <div style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>
            <SidebarLink active={route.kind === "launcher" && route.route === "settings"} href="#/settings" label={t.nav.settings} icon={<IcoSettings />} />
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflow: "hidden", background: "var(--bg)" }}>
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
                <SettingsPage snapshot={snapshot} onLogout={handleLogout} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {createOpen && <CreateServerDialog snapshot={snapshot} onClose={() => setCreateOpen(false)} onCreate={handleCreateServer} />}
        {renamingServer && <RenameServerDialog server={renamingServer} onClose={() => setRenamingServer(null)} onRename={performRename} />}
      </AnimatePresence>
    </>
  );
}

// ─── Feedback toast ───────────────────────────────────────────────────────────
function FeedbackBar({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(192,57,43,0.92)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,100,80,0.4)", color: "#ffd6d2", padding: "10px 18px", borderRadius: 6, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
    >
      {message}
    </motion.div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseHash(hash: string): ParsedRoute {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "server" && parts[1]) {
    return { kind: "server", serverUuid: parts[1], route: (parts[2] as ServerRoute) ?? "console" };
  }
  const r = (parts[0] as LauncherRoute) || "home";
  if (r !== "home" && r !== "servers" && r !== "settings") return { kind: "launcher", route: "home" };
  return { kind: "launcher", route: r };
}

function formatMb(value: number): string {
  return value >= 1024 ? `${(value / 1024).toFixed(1)} GiB` : `${value} MiB`;
}

function formatUptime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  const hours = Math.floor(mins / 60);
  if (hours === 0) return `${mins}min ${secs}s`;
  return `${hours}h ${mins % 60}min`;
}

function RenameServerDialog({ server, onClose, onRename }: { server: ServerRecord; onClose: () => void; onRename: (id: string, name: string) => Promise<void> }) {
  const [name, setName] = useState(server.displayName);
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onRename(server.serverUuid, name.trim());
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} style={{ width: 400, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>{t.files.renameServer}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-muted)" }}>{t.files.renameServerHint} <b>{server.displayName}</b></p>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-soft)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.files.serverName}</div>
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              autoFocus 
              style={{ width: "100%", background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", color: "#fff", fontSize: 14, outline: "none", transition: "border-color 0.15s" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "var(--green)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "var(--border)"}
            />
          </div>
          
          <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
            <button onClick={onClose} type="button" style={{ background: "transparent", border: "none", color: "var(--text-soft)", cursor: "pointer", padding: "8px 16px", borderRadius: 6, fontSize: 14, fontWeight: 600 }}>{t.cancel}</button>
            <Btn variant="primary" type="submit" disabled={busy || !name.trim()}>
              {busy ? t.files.saving_action : t.files.rename_action}
            </Btn>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
