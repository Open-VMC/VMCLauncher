import { AnimatePresence, motion } from "framer-motion";
import { MoreVertical } from "lucide-react";
import { useI18n } from "../../i18n";

export function ContextMenu({ show, onToggle, onRename, onDelete }: { show: boolean; onToggle: () => void; onRename: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggle}
        style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-heading)"; e.currentTarget.style.background = "var(--hover-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
      >
        <MoreVertical size={18} />
      </button>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.1 }}
            style={{ position: "absolute", top: 32, right: 0, background: "var(--dropdown-bg)", backdropFilter: "blur(20px)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, zIndex: 100, minWidth: 140, boxShadow: "var(--dropdown-shadow)" }}
          >
            <button onClick={onRename} style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", color: "var(--dropdown-text)", cursor: "pointer", borderRadius: 6, fontSize: 13, fontWeight: 500, display: "block", marginBottom: 2 }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-medium)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{t.files.rename}</button>
            <button onClick={onDelete} style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", color: "#ff5f52", cursor: "pointer", borderRadius: 6, fontSize: 13, fontWeight: 500, display: "block" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,95,82,0.12)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{t.files.delete}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
