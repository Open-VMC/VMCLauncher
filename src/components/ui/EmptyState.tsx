import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import { Btn } from "./Primitives";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
};

export function EmptyState({ onCreate }: { onCreate: () => void }) {
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
