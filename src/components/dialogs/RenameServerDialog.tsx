import React, { useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import type { ServerRecord } from "../../types";
import { Btn } from "../ui/Primitives";

export function RenameServerDialog({ server, onClose, onRename }: { server: ServerRecord; onClose: () => void; onRename: (id: string, name: string) => Promise<void> }) {
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "var(--overlay-bg)", backdropFilter: "blur(4px)" }} onMouseDown={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
        style={{ width: 400, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "24px", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>{t.files.renameServer}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-muted)" }}>{t.files.renameServerHint} <b>{server.displayName}</b></p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-soft)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.files.serverName}</div>
            <input
              value={name} onChange={(e) => setName(e.target.value)} autoFocus
              style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", color: "var(--text)", fontSize: 14, outline: "none", transition: "border-color 0.15s" }}
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
