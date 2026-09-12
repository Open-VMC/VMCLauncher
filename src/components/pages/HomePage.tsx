import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "../../i18n";
import type { LauncherSnapshot, ServerRecord } from "../../types";
import { Btn, StatusPill } from "../ui/Primitives";
import { EmptyState } from "../ui/EmptyState";
import { ContextMenu } from "../ui/ContextMenu";
import { getServerKindLabel } from "../../utils/server";

const HERO_IMAGES = [
  "/images/hero-mountains.jpeg",
  "/images/hero-ocean.jpeg",
  "/images/hero-cherry.jpeg",
];

function HeroCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % HERO_IMAGES.length), 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <AnimatePresence initial={false}>
        <motion.img
          key={HERO_IMAGES[index]}
          src={HERO_IMAGES[index]}
          alt=""
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 1.8, ease: [0.25, 0.1, 0.25, 1] } }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 1.4, ease: "easeInOut" } }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "var(--hero-img-filter)" }}
        />
      </AnimatePresence>
      <div style={{ position: "absolute", inset: 0, background: "var(--hero-overlay)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, zIndex: 10 }}>
        {HERO_IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            style={{ width: i === index ? 24 : 8, height: 8, borderRadius: 99, border: "none", background: i === index ? "var(--green)" : "var(--hero-dot)", cursor: "pointer", transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)", padding: 0 }}
          />
        ))}
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
      style={{ position: "relative", zIndex: showMenu ? 50 : 1, display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", transition: "border-color 0.15s, background 0.15s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-hover)"; (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLDivElement).style.background = "var(--bg-card)"; }}
    >
      <div style={{ width: 36, height: 36, background: "rgba(76,158,63,0.15)", border: "1px solid rgba(76,158,63,0.25)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16, fontWeight: 800, color: "var(--green-light)" }}>
        {server.displayName.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-heading)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{server.displayName}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          {getServerKindLabel(server.kind)} · {server.version}
        </div>
      </div>
      <StatusPill status={server.status} />
      <Btn variant={isActive ? "ghost" : "primary"} onClick={(e: React.MouseEvent) => { e.stopPropagation(); onLaunch(); }} style={{ flexShrink: 0 }}>
        {isActive ? t.open : t.launch}
      </Btn>
      <ContextMenu show={showMenu} onToggle={() => setShowMenu(!showMenu)} onRename={() => { setShowMenu(false); onRename(); }} onDelete={() => { setShowMenu(false); onDelete(); }} />
    </div>
  );
}

export function HomePage({ snapshot, onLaunch, onOpen, onCreate, onRename, onDelete }: {
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
      <div style={{ position: "relative", height: 340, flexShrink: 0, overflow: "hidden", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <HeroCarousel />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 48px 48px", pointerEvents: "none", zIndex: 20 }}>
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } } }}>
            <motion.h1 variants={{ hidden: { opacity: 0, y: 30, filter: "blur(8px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] } } }} style={{ fontSize: 44, fontWeight: 900, margin: 0, color: "var(--hero-text)", letterSpacing: "-0.03em", textShadow: "var(--hero-shadow)" }}>
              VMC Launcher
            </motion.h1>
            <motion.p variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } } }} style={{ fontSize: 14, color: "var(--hero-text-soft)", margin: "10px 0 0", maxWidth: 380, textShadow: "var(--hero-shadow-sm)" }}>
              {t.home.heroTagline}
            </motion.p>
          </motion.div>
        </div>
      </div>

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
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {snapshot.servers.map((server) => (
              <motion.div key={server.serverUuid} variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] } } }}>
                <ServerRow server={server} onOpen={() => void onOpen(server.serverUuid)} onLaunch={() => void onLaunch(server.serverUuid)} onRename={() => void onRename(server.serverUuid)} onDelete={() => void onDelete(server.serverUuid)} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
