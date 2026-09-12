import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import type { CreateServerPayload, InstallationProgress, LauncherSnapshot, ServerKind } from "../../types";
import { Btn, Input, FormField } from "../ui/Primitives";
import { getCpuCores } from "../../utils/platform";

// Tag badge

type TagType = "recommended" | "modded" | "beta";

const StarIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M6 1l1.3 2.6 2.9.4-2.1 2 .5 2.9L6 7.5l-2.6 1.4.5-2.9-2.1-2 2.9-.4z" />
  </svg>
);

function TagBadge({ label, type }: { label: string; type: TagType }) {
  const styles: Record<TagType, React.CSSProperties> = {
    recommended: { background: "rgba(76,158,63,0.15)", color: "var(--green-light)", border: "1px solid rgba(76,158,63,0.3)" },
    modded:      { background: "rgba(120,100,220,0.12)", color: "var(--text-muted)", border: "1px solid rgba(120,100,220,0.22)" },
    beta:        { background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" },
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", ...styles[type] }}>
      {type === "recommended" && <StarIcon />}
      {label}
    </span>
  );
}

// Server type dropdown

function ServerTypeDropdown({ catalog, value, onChange, tagRecommended, tagModded, tagBeta }: {
  catalog: LauncherSnapshot["catalog"];
  value: ServerKind;
  onChange: (k: ServerKind) => void;
  tagRecommended: string;
  tagModded: string;
  tagBeta: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function getKindTag(kind: ServerKind): { label: string; type: TagType } | null {
    if (kind === "papermc") return { label: tagRecommended, type: "recommended" };
    if (kind === "fabric" || kind === "forge" || kind === "neoforge") return { label: tagModded, type: "modded" };
    if (kind === "pumpkin") return { label: tagBeta, type: "beta" };
    return null;
  }

  const current = catalog.find((e) => e.kind === value);
  const currentTag = getKindTag(value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 12px", borderRadius: 7, cursor: "pointer", textAlign: "left",
          background: "var(--bg-input)", border: `1px solid ${open ? "var(--green)" : "var(--border-hover)"}`,
          color: "var(--text)", transition: "border-color 0.12s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500 }}>
          {current?.label ?? value}
          {currentTag && <TagBadge label={currentTag.label} type={currentTag.type} />}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s", flexShrink: 0 }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", zIndex: 30, top: "calc(100% + 6px)", left: 0, right: 0,
          background: "var(--dropdown-bg)", backdropFilter: "blur(20px)",
          border: "1px solid var(--border)", borderRadius: 8, padding: 4,
          boxShadow: "var(--dropdown-shadow)",
        }}>
          {catalog.map((entry) => {
            const selected = entry.kind === value;
            const tag = getKindTag(entry.kind as ServerKind);
            return (
              <button
                key={entry.kind}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(entry.kind as ServerKind); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", borderRadius: 6, cursor: "pointer", textAlign: "left",
                  background: selected ? "var(--hover-medium)" : "transparent",
                  border: "none", color: selected ? "var(--green-light)" : "var(--dropdown-text)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--hover-subtle)"; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400 }}>{entry.label}</span>
                {tag && <TagBadge label={tag.label} type={tag.type} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Version search select

function VersionSearchSelect({ versions, value, onChange }: { versions: string[]; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const filtered = useMemo(() => versions.filter((v) => v.toLowerCase().includes(query.trim().toLowerCase())), [versions, query]);

  useEffect(() => {
    if (!filtered.includes(value) && filtered[0]) onChange(filtered[0]);
  }, [filtered, value, onChange]);

  return (
    <div style={{ position: "relative" }}>
      <input
        value={isTyping ? query : value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setIsTyping(true); setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setIsTyping(true); setQuery(""); setOpen(true); }}
        onBlur={() => { setTimeout(() => { setOpen(false); setIsTyping(false); setQuery(""); }, 120); }}
        placeholder={t.createServer.versionSearchPlaceholder}
        style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-hover)", borderRadius: 6, color: "var(--text)", padding: "10px 12px", outline: "none", fontFamily: "JetBrains Mono, monospace", transition: "border-color 0.15s" }}
      />
      {open && (
        <div style={{ position: "absolute", zIndex: 20, top: "calc(100% + 6px)", left: 0, right: 0, maxHeight: 220, overflowY: "auto", background: "var(--dropdown-bg)", backdropFilter: "blur(20px)", border: "1px solid var(--border)", borderRadius: 8, padding: 4, boxShadow: "var(--dropdown-shadow)" }}>
          {filtered.length === 0 && <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>{t.createServer.noVersionFound}</div>}
          {filtered.map((v) => (
            <button key={v} type="button"
              onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); onChange(v); setOpen(false); setIsTyping(false); setQuery(""); }}
              style={{ width: "100%", textAlign: "left", background: v === value ? "var(--hover-medium)" : "transparent", border: "none", color: v === value ? "var(--green-light)" : "var(--dropdown-text)", padding: "7px 10px", cursor: "pointer", fontFamily: "JetBrains Mono, monospace", borderRadius: 6, fontSize: 13, transition: "background 0.1s" }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { if (v !== value) e.currentTarget.style.background = "var(--hover-subtle)"; }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { if (v !== value) e.currentTarget.style.background = "transparent"; }}
            >{v}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Main dialog

export function CreateServerDialog({ snapshot, onClose, onCreate, busy, installationProgress }: {
  snapshot: LauncherSnapshot;
  onClose: () => void;
  onCreate: (p: CreateServerPayload) => Promise<void>;
  busy: boolean;
  installationProgress: InstallationProgress | null;
}) {
  const { t } = useI18n();
  const catalogEmpty = snapshot.catalog.length === 0;
  const defaultCatalog = snapshot.catalog.find((e) => e.kind === "papermc") ?? snapshot.catalog[0];
  const [kind, setKind] = useState<ServerKind>(defaultCatalog?.kind as ServerKind ?? "papermc");

  const catalogEntry = useMemo(() => snapshot.catalog.find((e) => e.kind === kind) ?? defaultCatalog, [kind, snapshot.catalog]);
  const versionStrings = useMemo(() => (catalogEntry?.versions ?? []).map((v) => String(v.version)), [catalogEntry]);
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState(versionStrings[0] ?? "");
  const [memoryMb, setMemoryMb] = useState(4096);
  const [maxCpuCores, setMaxCpuCores] = useState(4);
  const [cpuCores, setCpuCores] = useState(2);
  useEffect(() => { getCpuCores().then((n) => { setMaxCpuCores(n); setCpuCores((prev) => Math.min(prev, n)); }).catch(() => {}); }, []);
  useEffect(() => setVersion(versionStrings[0] ?? ""), [versionStrings]);

  const isPumpkin = kind === "pumpkin";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(e: React.MouseEvent) => { if (!busy && e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
        style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 10, width: 440, maxHeight: "85vh", overflowY: "auto", padding: "28px 30px", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>{t.createServer.title}</h2>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-soft)" }}>{t.createServer.subtitle}</p>

        {catalogEmpty ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "24px 0" }}>
            <div style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>{t.loading}</div>
            <Btn variant="ghost" onClick={onClose}>{t.cancel}</Btn>
          </div>
        ) : (
          <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); void onCreate({ displayName, kind, version: isPumpkin ? "latest" : version, memoryMb, cpuCores }); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormField label={t.createServer.name}>
              <Input value={displayName} onChange={setDisplayName} placeholder={t.createServer.namePlaceholder} />
            </FormField>
            <FormField label={t.createServer.type}>
              <ServerTypeDropdown
                catalog={snapshot.catalog}
                value={kind}
                onChange={setKind}
                tagRecommended={t.createServer.tagRecommended}
                tagModded={t.createServer.tagModded}
                tagBeta={t.createServer.tagBeta}
              />
            </FormField>
            {isPumpkin && (
              <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 7, fontSize: 12, color: "var(--text-soft)", lineHeight: 1.5 }}>
                {t.createServer.pumpkinWarning}{" "}
                <a href="https://github.com/Pumpkin-MC/Pumpkin/issues" target="_blank" rel="noreferrer" style={{ color: "#f59e0b", textDecoration: "underline" }}>
                  GitHub
                </a>.
              </div>
            )}
            {!isPumpkin && versionStrings.length > 0 && (
              <FormField label={t.createServer.version}>
                <VersionSearchSelect versions={versionStrings} value={version} onChange={setVersion} />
              </FormField>
            )}
            <FormField label={t.createServer.memory}>
              <Input type="number" value={memoryMb} onChange={(v: string) => setMemoryMb(Number(v))} />
            </FormField>
            <FormField label={t.createServer.cpuCores}>
              <Input type="number" value={cpuCores} onChange={(v: string) => setCpuCores(Math.max(1, Math.min(maxCpuCores, Number(v) || 1)))} />
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
                {t.createServer.cpuCoresHint.replace("{max}", String(maxCpuCores))}
              </div>
            </FormField>
            {installationProgress && (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <strong style={{ fontSize: 13, color: "var(--text-heading)" }}>{t.createServer.installingTitle}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{String(installationProgress.percent)}%</span>
                </div>
                <div style={{ height: 8, background: "var(--hover-medium)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${installationProgress.percent}%`, height: "100%", background: "linear-gradient(90deg, var(--green) 0%, var(--green-light) 100%)", transition: "width 0.2s ease" }} />
                </div>
                <div style={{ fontSize: 13, color: "var(--text-heading)" }}>{String(installationProgress.detail)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                  {t.createServer.stepLabel.replace("{current}", String(installationProgress.currentStep)).replace("{total}", String(installationProgress.totalSteps))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <Btn variant="ghost" onClick={onClose} disabled={busy}>{t.cancel}</Btn>
              <Btn variant="primary" type="submit" disabled={busy}>{busy ? t.createServer.installing : t.createServer.cta}</Btn>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
