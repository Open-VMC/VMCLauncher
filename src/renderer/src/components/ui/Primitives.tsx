import React, { ReactNode } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../../i18n";
import { ServerRecord } from "@shared/contracts";

export function Btn({ variant = "ghost", disabled, onClick, type = "button", children, style }: any) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 20px",
    border: "none",
    borderRadius: 4,
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    userSelect: "none",
    textTransform: "uppercase",
    letterSpacing: "0.02em"
  };
  const variants: any = {
    primary: { background: "#3fb02b", color: "#fff", boxShadow: "0 2px 0 #2d851f" },
    danger: { background: "#e74c3c", color: "#fff", boxShadow: "0 2px 0 #c0392b" },
    ghost: { background: "rgba(255,255,255,0.05)", color: "var(--text)" },
    outline: { background: "transparent", color: "var(--text)", border: "1px solid var(--border-hover)" },
  };
  return (
    <motion.button
      whileTap={{ y: 1 }}
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </motion.button>
  );
}

export function Input({ value, onChange, placeholder, type = "text", disabled }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="mc-input"
      style={{
        width: "100%",
        background: "#0f1115",
        border: "1px solid #2d323d",
        borderRadius: 4,
        color: "#fff",
        padding: "10px 12px",
        outline: "none",
        fontFamily: "JetBrains Mono, monospace"
      }}
    />
  );
}

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#888", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

export function StatusPill({ status }: { status: ServerRecord["status"] }) {
  const { t } = useI18n();
  const colors: Record<string, string> = {
    stopped: "#7f8c8d",
    starting: "#f1c40f",
    running: "#2ecc71",
    stopping: "#e67e22",
    error: "#e74c3c",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: colors[status] }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: colors[status], boxShadow: `0 0 8px ${colors[status]}66` }} />
      {t.status[status] ?? status}
    </div>
  );
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#1a1d23", padding: "12px", borderRadius: 6, border: "1px solid #2d323d" }}>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#eee" }}>{value}</div>
    </div>
  );
}

export function Select({ value, onChange, children }: any) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        background: "#0f1115",
        border: "1px solid #2d323d",
        borderRadius: 4,
        color: "#fff",
        padding: "8px",
        outline: "none"
      }}
    >
      {children}
    </select>
  );
}
