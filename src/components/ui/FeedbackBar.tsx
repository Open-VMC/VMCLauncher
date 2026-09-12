import { motion } from "framer-motion";

export function FeedbackBar({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: "rgba(192,57,43,0.92)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,100,80,0.4)", color: "#ffd6d2", padding: "10px 18px", borderRadius: 6, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
    >
      {message}
    </motion.div>
  );
}
