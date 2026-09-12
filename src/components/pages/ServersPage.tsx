import { useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import type { LauncherSnapshot, ServerRecord } from "../../types";
import { Btn, StatusPill } from "../ui/Primitives";
import { ContextMenu } from "../ui/ContextMenu";
import { getServerKindLabel } from "../../utils/server";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
};

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
      <div style={{ position: "relative", zIndex: 20, height: 90, background: "linear-gradient(135deg, rgba(76,158,63,0.15) 0%, transparent 100%)", borderTopLeftRadius: 8, borderTopRightRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 900, color: "rgba(76,158,63,0.3)" }}>
        {server.displayName.slice(0, 1).toUpperCase()}
        <div style={{ position: "absolute", top: 10, right: 10 }}>
          <ContextMenu show={showMenu} onToggle={() => setShowMenu(!showMenu)} onRename={() => { setShowMenu(false); onRename(); }} onDelete={() => { setShowMenu(false); onDelete(); }} />
        </div>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{server.displayName}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>{getServerKindLabel(server.kind)}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <StatusPill status={server.status} />
          <Btn variant={isActive ? "ghost" : "primary"} onClick={(e: React.MouseEvent) => { e.stopPropagation(); onLaunch(); }} style={{ padding: "5px 10px", fontSize: 12 }}>
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

export function ServersPage({ snapshot, onLaunch, onOpen, onCreate, onRename, onDelete }: { snapshot: LauncherSnapshot; onLaunch: (id: string) => Promise<void>; onOpen: (id: string) => Promise<void>; onCreate: () => void; onRename: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div style={{ padding: "32px", overflow: "auto", height: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{t.servers.title}</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-soft)" }}>{t.servers.subtitle}</p>
      </div>
      <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
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
