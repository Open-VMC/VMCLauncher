import React, { ReactNode, useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { useI18n } from "../../i18n";
import type { ServerRecord } from "../../types";

export interface SelectOption {
  value: string;
  label: string;
}

export function Btn({ variant = "ghost", disabled, onClick, type = "button", children, style }: any) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 20px",
    border: "none",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    userSelect: "none",
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  };
  const variants: any = {
    primary: { background: "var(--green)", color: "#fff", boxShadow: "0 2px 0 var(--green-hover)" },
    danger: { background: "var(--red)", color: "#fff", boxShadow: "0 2px 0 var(--red-hover)" },
    ghost: { background: "var(--hover-medium)", color: "var(--text)" },
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

export function Input({ value, onChange, onBlur, placeholder, type = "text", disabled, autoFocus, onKeyDown }: any) {
  return (
    <input
      type={type}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      style={{
        width: "100%",
        background: "var(--bg-input)",
        border: "1px solid var(--border-hover)",
        borderRadius: 6,
        color: "var(--text)",
        padding: "10px 12px",
        outline: "none",
        fontFamily: "JetBrains Mono, monospace",
        transition: "border-color 0.15s",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--border-hover)";
        if (onBlur) onBlur(e.target.value);
      }}
    />
  );
}

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase" }}>
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
    starting: "var(--yellow)",
    running: "#2ecc71",
    stopping: "#e67e22",
    error: "var(--red)",
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
    <div style={{ background: "var(--bg-input)", padding: "12px", borderRadius: 6, border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-heading)" }}>{value}</div>
    </div>
  );
}

export function Select({ value, onChange, options, dropUp }: { value: string; onChange: (v: string) => void; options: SelectOption[]; dropUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: "var(--bg-input)",
          border: open ? "1px solid var(--green)" : "1px solid var(--border-hover)",
          borderRadius: 6,
          color: "var(--text)",
          padding: "9px 12px",
          fontSize: 13,
          fontFamily: "inherit",
          cursor: "pointer",
          outline: "none",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
        onBlur={(e) => { if (!open) e.currentTarget.style.borderColor = "var(--border-hover)"; }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {String(selected?.label ?? value)}
        </span>
        <ChevronDown
          size={14}
          style={{
            opacity: 0.5,
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: dropUp ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: dropUp ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              ...(dropUp ? { bottom: "calc(100% + 4px)" } : { top: "calc(100% + 4px)" }),
              left: 0,
              minWidth: "100%",
              width: "max-content",
              maxWidth: 320,
              background: "var(--dropdown-bg)",
              backdropFilter: "blur(20px)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 4,
              zIndex: 200,
              boxShadow: "var(--dropdown-shadow)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "7px 10px",
                  background: opt.value === value ? "var(--hover-medium)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  color: opt.value === value ? "var(--green-light)" : "var(--dropdown-text)",
                  fontSize: 13,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (opt.value !== value) e.currentTarget.style.background = "var(--hover-subtle)";
                }}
                onMouseLeave={(e) => {
                  if (opt.value !== value) e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{String(opt.label)}</span>
                {opt.value === value && <Check size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
